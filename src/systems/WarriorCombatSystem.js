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
  // M8-D: 打ち上げ（通常敵のみ。エリート / ボスは体勢削りへ変換）。
  launch: { maxAirborneMs: 900, immuneMs: 1200, allowElite: false, allowBoss: false, poiseConversion: 1.35 },
  // M8-D: 前面防御（方向の分かる被弾だけを前面判定する）。
  frontalGuard: { requireDirection: true, maxFrontalMitigation: 0.55, sideMultiplier: 0.35, backMultiplier: 0.0 },
  // M8-D: 掴み / 投げ（通常敵のみ。ボスは掴まない）。
  grab: { allowElite: false, allowBoss: false, maxGrabPerCast: 1, maxThrowMs: 700, worldMargin: 24, bossPoiseMultiplier: 1.0 },
  // M8-D: 戦旗の陣（常に 1 つ・内側でのみ効く）。
  rally: {
    maxFields: 1, maxDurationMs: 12000, maxComboGrace: 0.8, maxFuryGain: 0.6,
    maxMitigation: 0.25, maxMeleeArea: 0.3, maxKillHealBonus: 0.5,
  },
  // M8-D: 低 HP スケーリング（自傷なし・処刑なし・必ず頭打ち）。
  lowHp: { maxMissingHpMultiplier: 1.6 },
  // M8-E: 直線判定（貫穿突き）。画面端まで届かせない。
  line: {
    maxLineLength: 300, maxWidth: 90, maxTargets: 12,
    maxHitsPerTargetPerCast: 2, maxStepInDistance: 96, toughSingleTargetRatio: 0.35,
  },
  // M8-E: 決闘（同時 1 体・formal status を作らない）。
  duel: {
    maxTargets: 1, maxDurationMs: 12000, maxMeleeDamageBonus: 0.5, maxPoiseDamageBonus: 0.6,
    maxFuryGainBonus: 0.4, maxRetargetsPerCast: 1, maxExtensionMs: 3600, extensionPerBreakMs: 1200,
    allowNormalTarget: true, bossPriority: 3, elitePriority: 2, normalPriority: 1,
  },
  // M8-E: 修羅の構え（攻め寄りの timed stance・重ねがけしない）。
  trance: {
    maxStances: 1, maxDurationMs: 10000, maxMeleeDamageBonus: 0.45, maxAttackSpeedBonus: 0.32,
    maxComboGraceBonus: 0.45, maxFuryGainBonus: 0.5, maxMitigationPenalty: 0.15,
    minMitigationAfterPenalty: 0, combinedOffenseCap: 0.85, maxKillHealBonus: 0.5,
  },
  // M8-E: 弾き返し（通常の敵弾だけ・完全無効化しない）。
  deflection: {
    maxWindowMs: 3000, maxDeflectionsPerWindow: 8, maxDeflectRadius: 150,
    maxReflectedDamage: 96, maxReflectedSpeed: 480, maxReflectLifeMs: 1000, maxReflectGeneration: 1,
    allowedKinds: ['bossBullet', 'bullet'], deniedKinds: ['beam', 'telegraph', 'hazard', 'dot', 'ground'],
    counterPriority: 4,
  },
  // M8-E: 震天踏破（進みながら複数地点を踏む）。
  march: { maxStomps: 8, maxMarchMs: 2600, maxStepDistance: 96, maxRadius: 170, maxMitigation: 0.2, worldMargin: 24 },
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
    // M8-D: Wave2 の共通状態（スキルは BattleScene の内部状態を触らず、ここへ集約する）。
    this.frontGuard = { leftMs: 0, mitigation: 0, arc: 0, facing: 0, source: null };
    this.rallyField = null;          // { x, y, leftMs, radius, comboGrace, furyGain, mitigation, meleeArea, killHealBonus, perSecondCapBonus, source }
    this._rallyInside = false;
    this._grab = null;               // { seq, phase, leftMs, source }（敵オブジェクトは持たない）
    // M8-E: 最終 Wave の共通状態。いずれも敵 / 弾のオブジェクトは持たず、安定 runtime id だけを持つ。
    this._duel = null;               // { seq, kind, leftMs, extendedMs, retargets, bonuses, source }
    this._trance = null;             // { leftMs, meleeDamageBonus, attackSpeedBonus, comboGraceBonus, furyGainBonus, mitigationPenalty, killHealBonus, perSecondCapBonus, source }
    this._deflect = null;            // { leftMs, used, max, radius, reflect, source }
    this._deflectedIds = new Set();  // 1 つの弾を 2 度弾かないための runtime id 集合
    this._eventReaction = null;      // 1 被弾 / 1 弾イベントにつき 1 系統だけ反応させるための調停マーク
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
      // M8-D: Wave2（打ち上げ / 前面防御 / 掴み・投げ / 段組み / 刃防陣 / 低HP / 斧 / 踏み込み / 戦旗）。
      launches: 0, launchBlocked: 0, launchPoiseConverted: 0,
      frontGuardUptimeMs: 0, frontGuardBlocked: 0, frontGuardSideHits: 0, frontGuardBackHits: 0,
      grabs: 0, grabRefused: 0, grabCancels: 0, throwImpacts: 0, throwDistance: 0,
      comboStages: 0, guardTicks: 0, guardUptimeMs: 0,
      lowHpBonusSum: 0, lowHpBonusSamples: 0,
      axeOutboundHits: 0, axeReturnHits: 0, stepIns: 0, stepInDistance: 0,
      rallyPlacements: 0, rallyUptimeMs: 0, rallyInsideMs: 0, rallyAssists: 0, rallyKillHealBonus: 0,
      // M8-E: 最終 Wave（直線突き / 決闘 / 修羅の構え / 踏破 / 刃返し）。
      lineThrusts: 0, linePenetrations: 0, lineToughHits: 0, lineStepIns: 0,
      duelStarts: 0, duelBoss: 0, duelElite: 0, duelNormal: 0,
      duelUptimeMs: 0, duelDamageBonusSum: 0, duelHits: 0, duelRetargets: 0, duelExtensions: 0, duelClears: 0,
      tranceStarts: 0, tranceUptimeMs: 0, tranceDamageBonusSum: 0, trancePenaltySum: 0,
      tranceSamples: 0, tranceOffenseCapped: 0, tranceKillHealBonus: 0,
      marchStomps: 0, marchCompleted: 0, marchDistance: 0, marchFinalStomps: 0,
      deflectWindows: 0, deflectUptimeMs: 0, deflectSeen: 0, deflected: 0, deflectRejected: 0,
      deflectCapReached: 0, reflectedSpawned: 0, reflectedHits: 0, reflectedDamage: 0,
      mirrorCounters: 0, reactionArbitrated: 0,
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
    // M8-E: 修羅の構え（闘気解放との合成上限つき）と、決闘対象へだけ乗る上乗せ。
    const tr = this.getBattleTranceModifiers();
    if (tr.meleeDamage > 0) m *= (1 + tr.meleeDamage);
    const du = this.getDuelModifiers(target);
    if (du.meleeDamage > 0) m *= (1 + du.meleeDamage);
    if (target && target.isBoss && this.exposedActive) {
      m *= (1 + num(this.cfg.poise.boss.exposedMeleeDamageMult, 0) + this.mods.exposedDamageBonus);
    }
    return m;
  }
  // 近接範囲倍率（コンボ閾値のみ。パッシブ area は既存 PassiveManager 経路が担当）。
  // M8-D: 戦旗の陣の内側にいる間だけ間合いが伸びる（外側では加算 0）。
  meleeAreaMultiplier() { return 1 + this.comboBonuses().meleeAreaMult + this.rallyBonus('meleeArea'); }
  // 攻撃/詠唱速度倍率 → クールダウン倍率（1/speed）。
  attackSpeedMultiplier() {
    const c = this.comboBonuses();
    let s = (1 + c.attackSpeedMult) * this.mods.attackSpeedMult;
    if (this.releaseActive) s *= num(this.cfg.furyRelease.attackSpeedMult, 1);
    s *= (1 + this.getBattleTranceModifiers().attackSpeed); // M8-E: 修羅の構え
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
    amt *= (1 + this.rallyBonus('furyGain'));               // M8-D: 戦旗の陣（内側のみ）
    amt *= (1 + this.getBattleTranceModifiers().furyGain);  // M8-E: 修羅の構え
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
      * (this.warCry.leftMs > 0 ? (1 + this.warCry.comboGraceBonus) : 1) // M8-C: 戦吼
      * (1 + this.rallyBonus('comboGrace'))                              // M8-D: 戦旗の陣（内側のみ）
      * (1 + this.getBattleTranceModifiers().comboGrace);                 // M8-E: 修羅の構え
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

  // コンボの「猶予（grace）」だけを戻す。コンボ値そのものは 1 も増やさない。
  // 進化「無影燕返」が使う（無料コンボの大量付与を作らないための専用経路）。
  refillComboGrace(ratio) {
    if (!this.enabled) return 0;
    const r = clamp(num(ratio, 0), 0, 1);
    if (r <= 0 || this.combo <= 0) return 0;
    const cfg = this.cfg.combo;
    const full = num(cfg.graceMs, 2500) * Math.max(0.1, this.mods.comboGraceMult)
      * (this.warCry.leftMs > 0 ? (1 + this.warCry.comboGraceBonus) : 1)
      * (1 + this.rallyBonus('comboGrace'))
      * (1 + this.getBattleTranceModifiers().comboGrace);
    const next = Math.max(this.comboGraceLeftMs, full * r);
    const added = next - this.comboGraceLeftMs;
    this.comboGraceLeftMs = next;
    return added;
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
    // M8-D: 血盟戦旗（陣の内側で倒したときだけ回復量が小幅に伸びる。毎秒上限は共有したまま）。
    const oath = this.rallyBonus('killHealBonus');
    if (oath > 0) { amount *= (1 + oath); this.telemetry.rallyKillHealBonus += oath; this.telemetry.rallyAssists += 1; }
    // M8-E: 血染修羅（構えの最中に倒したときだけ回復量が小幅に伸びる。毎秒上限は下で共有したまま）。
    const asura = this.tranceActive ? Math.max(0, num(this._trance.killHealBonus, 0)) : 0;
    if (asura > 0) { amount *= (1 + asura); this.telemetry.tranceKillHealBonus += asura; }
    if (enemy && enemy.isBoss) amount *= num(cfg.bossMult, 1);
    else if (enemy && enemy.isElite) amount *= num(cfg.eliteMult, 1);
    if (this.releaseActive) amount *= num(cfg.releaseMult, 1) * this.mods.killHealReleaseMult;
    if (amount <= 0) return 0;
    // 毎秒上限（永久機関の防止）。
    const now = this._now();
    const w = this._killHealWindow;
    if (now - w.startMs >= 1000) { w.startMs = now; w.healed = 0; }
    const capPerSec = maxHp * num(cfg.perSecondCapPercent, 0) * Math.max(0, this.mods.killHealCapMult)
      * (1 + this.rallyBonus('perSecondCapBonus'))  // M8-D: 血盟戦旗（陣の内側でだけ毎秒上限が小幅に伸びる）
      * (1 + (this.tranceActive ? Math.max(0, num(this._trance.perSecondCapBonus, 0)) : 0)); // M8-E: 血染修羅
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
    r += this.frontGuardMitigation(ctx);   // M8-D: 鉄壁突進の前面防御（方向のある被弾のみ）
    r += this.rallyBonus('mitigation');    // M8-D: 戦旗の陣（内側のみ）
    if (this.releaseActive) r += num(this.cfg.furyRelease.damageReduction, 0);
    if (this.unyieldingActive) r += num(this.cfg.unyielding.damageReduction, 0) * Math.max(0, this.mods.unyieldingPowerMult);
    r += this.mods.damageReductionBonus;                 // Job Lv20 / 重装
    // M8-E: 修羅の構えのリスク。**合計から差し引くだけ**なので、重装 / 闘気解放 / 不屈は無効化されない。
    // 下限は data（minMitigationAfterPenalty・既定 0）で、必ず 0 未満にならない。
    const pen = this.getBattleTranceModifiers().mitigationPenalty;
    if (pen > 0) {
      const floor = Math.max(0, num(this.cfg.trance.minMitigationAfterPenalty, 0));
      r = Math.max(floor, r - pen);
      this.telemetry.trancePenaltySum += pen;
      this.telemetry.tranceSamples += 1;
    }
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

  // ================= M8-D: Wave2 の共通フック =================
  // スキルは Scene の内部状態を直接いじらず、必ずここを通す。すべて data（balance.warrior）駆動。

  // ---- 打ち上げ（昇竜斬 / 天衝断空）----
  // 通常敵だけを短く浮かせる。エリート / ボスは浮かせず、その分を体勢削りへ変換して返す。
  // 戻り値: { launched, poiseBonus, reason }
  launchPolicy(target, o = {}) {
    const out = { launched: false, poiseBonus: 0, reason: 'none' };
    if (!this.enabled || !target || !target.alive) { out.reason = 'invalid'; return out; }
    const cfg = this.cfg.launch;
    const hard = !!target.isBoss || !!target.isElite;
    if (hard) {
      const allow = target.isBoss ? cfg.allowBoss === true : cfg.allowElite === true;
      if (!allow) {
        out.poiseBonus = Math.max(0, num(o.poiseDamage, 0)) * Math.max(0, num(cfg.poiseConversion, 1));
        out.reason = target.isBoss ? 'bossNoLaunch' : 'eliteNoLaunch';
        this.telemetry.launchBlocked += 1;
        this.telemetry.launchPoiseConverted += out.poiseBonus;
        return out;
      }
    }
    // 直前に打ち上げた相手は一定時間浮かせない（無限に浮かせ続けない）。
    if (num(target._launchImmuneUntil, 0) > this._now()) { out.reason = 'immune'; return out; }
    out.launched = true;
    out.reason = 'launch';
    this.telemetry.launches += 1;
    return out;
  }
  // 打ち上げの持続（data の上限でクランプ）と免疫時間を返す。実際の座標操作は Scene 側。
  launchDurationMs(requested) {
    return clamp(num(requested, 0), 0, num(this.cfg.launch.maxAirborneMs, 900));
  }
  // 打ち上げ免疫の長さ。skill が短く申告できるが、balance の上限を超えられない。
  launchImmuneMs(requested) {
    const capMs = Math.max(0, num(this.cfg.launch.immuneMs, 0));
    const r = num(requested, NaN);
    return Number.isFinite(r) ? clamp(r, 0, capMs) : capMs;
  }

  // ---- 前面防御（鉄壁突進 / 城塞蹂躙）----
  // 方向の分かる被弾だけを前面判定する。方向なし（DoT・全体）には前面軽減を乗せない。
  beginFrontGuard(source, o = {}) {
    if (!this.enabled || !source) return null;
    const cfg = this.cfg.frontalGuard;
    const g = {
      leftMs: Math.max(0, num(o.durationMs, 0)),
      mitigation: clamp(num(o.mitigation, 0), 0, num(cfg.maxFrontalMitigation, 0.55)),
      arc: Math.max(0, num(o.frontArc, 0)),
      facing: num(o.facing, 0),
      source,
    };
    if (g.leftMs <= 0 || g.arc <= 0) return null;
    this.frontGuard = g; // refresh（重ねない）
    return { ...g };
  }
  updateFrontGuardFacing(source, facing) {
    if (this.frontGuard.source === source && this.frontGuard.leftMs > 0) this.frontGuard.facing = num(facing, this.frontGuard.facing);
  }
  endFrontGuard(source) {
    if (!source || this.frontGuard.source === source) this.frontGuard = { leftMs: 0, mitigation: 0, arc: 0, facing: 0, source: null };
  }
  get frontGuardActive() { return this.frontGuard.leftMs > 0; }
  // 被弾方向に応じた軽減量。ctx.fromX / fromY があるときだけ前面判定する。
  // 合計は damageReduction() 側で maxTotalReduction（70%）へ必ずクランプされる。
  frontGuardMitigation(ctx = {}) {
    if (!this.enabled || this.frontGuard.leftMs <= 0) return 0;
    const cfg = this.cfg.frontalGuard;
    const hasDir = isFiniteNum(ctx.fromX) && isFiniteNum(ctx.fromY) && isFiniteNum(ctx.x) && isFiniteNum(ctx.y);
    if (!hasDir) {
      // 方向が分からない被弾（DoT・画面全体）は前面扱いにしない。
      if (cfg.requireDirection !== false) return 0;
      return this.frontGuard.mitigation * clamp(num(cfg.sideMultiplier, 0), 0, 1);
    }
    let d = Math.atan2(ctx.fromY - ctx.y, ctx.fromX - ctx.x) - this.frontGuard.facing;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const half = this.frontGuard.arc / 2;
    if (Math.abs(d) <= half) { this.telemetry.frontGuardBlocked += 1; return this.frontGuard.mitigation; }
    if (Math.abs(d) <= Math.PI / 2 + half) {
      this.telemetry.frontGuardSideHits += 1;
      return this.frontGuard.mitigation * clamp(num(cfg.sideMultiplier, 0), 0, 1);
    }
    this.telemetry.frontGuardBackHits += 1;
    return this.frontGuard.mitigation * clamp(num(cfg.backMultiplier, 0), 0, 1);
  }

  // ---- 掴み / 投げ（豪腕投げ / 山岳投擲）----
  // 通常敵だけ掴める。エリートはその場で叩きつけ、ボスは掴まず近接の体勢打撃へ置換する。
  grabPolicy(target) {
    const out = { canGrab: false, mode: 'none', reason: 'none' };
    if (!this.enabled || !target || !target.alive) { out.reason = 'invalid'; return out; }
    const cfg = this.cfg.grab;
    if (target.isBoss) {
      if (cfg.allowBoss !== true) {
        out.mode = 'bossStrike'; out.reason = 'bossNoGrab';
        // 掴めない代わりの一撃は、体勢削りだけを data の倍率で調整する（ダメージは触らない）。
        out.poiseMultiplier = Math.max(0, num(cfg.bossPoiseMultiplier, 1));
        this.telemetry.grabRefused += 1; return out;
      }
    } else if (target.isElite) {
      if (cfg.allowElite !== true) { out.mode = 'eliteSlam'; out.reason = 'eliteNoGrab'; this.telemetry.grabRefused += 1; return out; }
    }
    out.canGrab = true; out.mode = 'throw'; out.reason = 'grab';
    return out;
  }
  // 掴みの開始。敵オブジェクトは持たず、安定 runtime id（_seq）だけを保持する。
  beginGrab(source, seq) {
    if (!this.enabled || !source) return null;
    if (this._grab) return null;                 // 1 度に 1 つだけ（再帰投げを作らない）
    this._grab = { source, seq, phase: 'hold', leftMs: Math.max(0, num(this.cfg.grab.maxThrowMs, 700)) };
    this.telemetry.grabs += 1;
    return { ...this._grab };
  }
  grabState(source) { return this._grab && this._grab.source === source ? { ...this._grab } : null; }
  setGrabPhase(source, phase) { if (this._grab && this._grab.source === source) this._grab.phase = phase; }
  endGrab(source, cancelled) {
    if (!this._grab) return false;
    if (source && this._grab.source !== source) return false;
    this._grab = null;
    if (cancelled) this.telemetry.grabCancels += 1;
    return true;
  }
  get grabbing() { return !!this._grab; }
  maxGrabPerCast() { return Math.max(1, Math.round(num(this.cfg.grab.maxGrabPerCast, 1))); }
  noteThrowImpact(distance) {
    if (!this.enabled) return;
    this.telemetry.throwImpacts += 1;
    this.telemetry.throwDistance += Math.max(0, num(distance, 0));
  }

  // ---- 段組みコンボ（三段砕き / 天衝断空の 2 段目など）----
  noteComboStage() { if (this.enabled) this.telemetry.comboStages += 1; }
  // ---- 刃防陣 ----
  noteGuardTick() { if (this.enabled) this.telemetry.guardTicks += 1; }
  // ---- 低 HP スケーリング（狂戦猛進）----
  // 失った HP に比例した倍率。data の上限で必ず頭打ちになる。自傷も処刑もしない。
  lowHpDamageMultiplier(bonusPerMissing) {
    if (!this.enabled) return 1;
    const maxHp = num(this._maxHp, 0);
    if (maxHp <= 0) return 1;
    const missing = clamp(1 - num(this._curHp, 0) / maxHp, 0, 1);
    const cap = Math.max(1, num(this.cfg.lowHp.maxMissingHpMultiplier, 1));
    const m = clamp(1 + missing * Math.max(0, num(bonusPerMissing, 0)), 1, cap);
    this.telemetry.lowHpBonusSum += m;
    this.telemetry.lowHpBonusSamples += 1;
    return m;
  }
  // ---- 戦斧の往復 ----
  noteAxeHit(returning) {
    if (!this.enabled) return;
    if (returning) this.telemetry.axeReturnHits += 1; else this.telemetry.axeOutboundHits += 1;
  }
  // ---- 安全な踏み込み（破城膝撃）----
  noteStepIn(distance) {
    if (!this.enabled) return;
    this.telemetry.stepIns += 1;
    this.telemetry.stepInDistance += Math.max(0, num(distance, 0));
  }

  // ---- 戦旗の陣（戦旗招集 / 血盟戦旗）----
  // 常に 1 つだけ。再設置は置換（refresh）で、重ねがけしない。
  placeRallyField(source, o = {}) {
    if (!this.enabled || !source) return null;
    const cfg = this.cfg.rally;
    // 陣は data の本数上限まで（既定 1）。0 なら張らない。重ねがけは常に置換。
    if (Math.max(0, num(cfg.maxFields, 1)) < 1) return null;
    const dur = clamp(num(o.durationMs, 0), 0, num(cfg.maxDurationMs, 12000));
    if (dur <= 0) return null;
    this.rallyField = {
      source, x: num(o.x, 0), y: num(o.y, 0), leftMs: dur, totalMs: dur,
      radius: Math.max(1, num(o.radius, 1)),
      comboGrace: clamp(num(o.comboGrace, 0), 0, num(cfg.maxComboGrace, 0.8)),
      furyGain: clamp(num(o.furyGain, 0), 0, num(cfg.maxFuryGain, 0.6)),
      mitigation: clamp(num(o.mitigation, 0), 0, num(cfg.maxMitigation, 0.25)),
      meleeArea: clamp(num(o.meleeArea, 0), 0, num(cfg.maxMeleeArea, 0.3)),
      killHealBonus: clamp(num(o.killHealBonus, 0), 0, num(cfg.maxKillHealBonus, 0.5)),
      perSecondCapBonus: clamp(num(o.perSecondCapBonus, 0), 0, num(cfg.maxKillHealBonus, 0.5)),
    };
    this._rallyInside = false;
    this.telemetry.rallyPlacements += 1;
    this._emit('rallyField', { ...this.rallyField });
    return { ...this.rallyField };
  }
  clearRallyField(source) {
    if (!this.rallyField) return false;
    if (source && this.rallyField.source !== source) return false;
    this.rallyField = null;
    this._rallyInside = false;
    return true;
  }
  get rallyActive() { return !!this.rallyField && this.rallyField.leftMs > 0; }
  get rallyInside() { return this._rallyInside; }
  // 毎フレーム、プレイヤー座標で内外を更新する（内側にいるときだけバフが効く）。
  updateRallyPosition(x, y) {
    if (!this.rallyField) { this._rallyInside = false; return false; }
    const dx = num(x, 0) - this.rallyField.x;
    const dy = num(y, 0) - this.rallyField.y;
    this._rallyInside = (dx * dx + dy * dy) <= this.rallyField.radius * this.rallyField.radius;
    return this._rallyInside;
  }
  // 内側にいるときだけの効果値（外側では常に 0）。
  rallyBonus(key) {
    if (!this.rallyActive || !this._rallyInside) return 0;
    return num(this.rallyField[key], 0);
  }

  // ================= M8-E: 直線突き（貫穿突き / 神速貫陣）=================
  // 「前方の狭い直線」を判定形状として扱うための共通経路。判定そのものは BattleScene が行い、
  // ここでは data の上限（長さ / 幅 / 対象数 / 同一敵への多重命中）だけを決める。
  beginPiercingLunge(o = {}) {
    if (!this.enabled) return null;
    const cfg = this.cfg.line;
    const out = {
      length: clamp(num(o.lineLength, 0), 0, num(cfg.maxLineLength, 300)),
      width: clamp(num(o.width, 0), 0, num(cfg.maxWidth, 90)),
      maxTargets: Math.max(1, Math.min(Math.round(num(o.maxTargets, 1)), Math.round(num(cfg.maxTargets, 12)))),
      maxHitsPerTarget: Math.max(1, Math.min(Math.round(num(o.maxHitsPerTarget, 1)), Math.round(num(cfg.maxHitsPerTargetPerCast, 2)))),
      stepIn: clamp(num(o.stepIn, 0), 0, num(cfg.maxStepInDistance, 96)),
    };
    if (out.length <= 0 || out.width <= 0) return null;
    this.telemetry.lineThrusts += 1;
    return out;
  }
  // 直線判定の対象を「絞るかどうか」だけを決める。硬い相手（エリート / ボス）が混ざるときは
  // 単体寄りへ寄せる＝通常敵の群れを薙ぐ用途と、格上を突く用途を data で分ける。
  resolveLineMeleeTargets(candidates, o = {}) {
    if (!this.enabled || !Array.isArray(candidates)) return [];
    const cfg = this.cfg.line;
    const maxN = Math.max(1, Math.min(Math.round(num(o.maxTargets, 1)), Math.round(num(cfg.maxTargets, 12))));
    const tough = candidates.filter((c) => c && (c.isElite || c.isBoss));
    if (tough.length > 0) {
      // 硬い相手が射線上にいるときは、そちらへ威力を集める（通常敵の巻き込みを絞る）。
      const ratio = clamp(num(cfg.toughSingleTargetRatio, 0.35), 0, 1);
      const room = Math.max(1, Math.round(maxN * ratio));
      const rest = candidates.filter((c) => c && !c.isElite && !c.isBoss).slice(0, room);
      this.telemetry.lineToughHits += tough.length;
      return [...tough, ...rest].slice(0, maxN);
    }
    const picked = candidates.slice(0, maxN);
    if (picked.length > 1) this.telemetry.linePenetrations += picked.length - 1;
    return picked;
  }
  noteLineStepIn(distance) {
    if (!this.enabled) return;
    this.telemetry.lineStepIns += 1;
    this.telemetry.stepInDistance += Math.max(0, num(distance, 0));
  }

  // ================= M8-E: 決闘（一騎討ち / 覇王討ち）=================
  // 対象は同時に 1 体だけ。**敵オブジェクトは持たず安定 runtime id（_seq）だけ**を保持する。
  // formal status は作らない（相手側に debuff を貼らない＝戦士本人の補正としてだけ効く）。
  duelPriority(target) {
    if (!target || !target.alive) return -1;
    const cfg = this.cfg.duel;
    if (target.isBoss) return Math.max(0, num(cfg.bossPriority, 3));
    if (target.isElite) return Math.max(0, num(cfg.elitePriority, 2));
    return cfg.allowNormalTarget === false ? -1 : Math.max(0, num(cfg.normalPriority, 1));
  }
  beginDuelChallenge(source, target, o = {}) {
    if (!this.enabled || !source) return null;
    if (this.duelPriority(target) < 0) return null;
    const cfg = this.cfg.duel;
    const dur = clamp(num(o.durationMs, 0), 0, num(cfg.maxDurationMs, 12000));
    if (dur <= 0) return null;
    const kind = target.isBoss ? 'boss' : (target.isElite ? 'elite' : 'normal');
    // 重ねがけしない（refresh / 再選択）。既に決闘中なら置き換わるだけで積み上がらない。
    this._duel = {
      source, seq: target._seq, kind, leftMs: dur, totalMs: dur,
      extendedMs: 0, retargets: 0,
      meleeDamageBonus: clamp(num(o.meleeDamageBonus, 0), 0, num(cfg.maxMeleeDamageBonus, 0.5)),
      poiseDamageBonus: clamp(num(o.poiseDamageBonus, 0), 0, num(cfg.maxPoiseDamageBonus, 0.6)),
      furyGainBonus: clamp(num(o.furyGainBonus, 0), 0, num(cfg.maxFuryGainBonus, 0.4)),
      maxRetargets: Math.max(0, Math.min(Math.round(num(o.maxRetargets, 0)), Math.round(num(cfg.maxRetargetsPerCast, 1)))),
      retargetRange: Math.max(0, num(o.retargetRange, 0)),
      // 未指定なら balance の既定を使う（進化だけが自前の値を持つ）。
      extendPerBreakMs: Math.max(0, num(o.extendPerBreakMs, num(cfg.extensionPerBreakMs, 0))),
      maxExtensionMs: clamp(num(o.maxExtensionMs, 0), 0, num(cfg.maxExtensionMs, 3600)),
    };
    this.telemetry.duelStarts += 1;
    if (kind === 'boss') this.telemetry.duelBoss += 1;
    else if (kind === 'elite') this.telemetry.duelElite += 1;
    else this.telemetry.duelNormal += 1;
    this._emit('duelStart', { seq: this._duel.seq, kind, durationMs: dur });
    return { ...this._duel };
  }
  clearDuelTarget(source, reason) {
    if (!this._duel) return false;
    if (source && this._duel.source !== source) return false;
    this._duel = null;
    this.telemetry.duelClears += 1;
    this._emit('duelEnd', { reason: reason || 'clear' });
    return true;
  }
  get duelActive() { return !!this._duel && this._duel.leftMs > 0; }
  get duelSeq() { return this._duel ? this._duel.seq : null; }
  get duelKind() { return this._duel ? this._duel.kind : null; }
  duelState(source) { return this._duel && (!source || this._duel.source === source) ? { ...this._duel } : null; }
  get duelLeftMs() { return this._duel ? Math.max(0, this._duel.leftMs) : 0; }
  // 表示専用（telemetry を動かさない）。F9 / HUD はこちらを使う。
  duelTargetInfo() { return this._duel ? { seq: this._duel.seq, kind: this._duel.kind } : null; }
  duelBonus(key) {
    if (!this.duelActive) return 0;
    const d = this._duel;
    if (key === 'meleeDamage') return d.meleeDamageBonus;
    if (key === 'poiseDamage') return d.poiseDamageBonus;
    if (key === 'furyGain') return d.furyGainBonus;
    return 0;
  }
  // 決闘対象かどうか（安定 runtime id の一致だけで判定する）。
  isDuelTarget(target) {
    return !!(this.duelActive && target && target._seq != null && target._seq === this._duel.seq);
  }
  // 対象へだけ乗る補正。対象以外・他ジョブでは常に 0（＝他 job の damage を強化しない）。
  getDuelModifiers(target) {
    const none = { meleeDamage: 0, poiseDamage: 0, furyGain: 0 };
    if (!this.isDuelTarget(target)) return none;
    const d = this._duel;
    this.telemetry.duelHits += 1;
    this.telemetry.duelDamageBonusSum += d.meleeDamageBonus;
    return { meleeDamage: d.meleeDamageBonus, poiseDamage: d.poiseDamageBonus, furyGain: d.furyGainBonus };
  }
  // 対象の体勢を崩したときの小幅延長（合計上限つき・進化のみ）。
  noteDuelStanceBreak(target) {
    if (!this.duelActive || !this.isDuelTarget(target)) return 0;
    const d = this._duel;
    const room = Math.max(0, d.maxExtensionMs - d.extendedMs);
    const add = Math.min(d.extendPerBreakMs, room);
    if (add <= 0) return 0;
    d.leftMs += add; d.extendedMs += add;
    this.telemetry.duelExtensions += 1;
    return add;
  }
  // 対象撃破時の再選択（1 発動につき maxRetargets 回まで・近距離の格上のみ）。
  retargetDuel(next) {
    if (!this._duel) return false;
    const d = this._duel;
    if (d.retargets >= d.maxRetargets) { this.clearDuelTarget(null, 'targetLost'); return false; }
    if (this.duelPriority(next) < 2) { this.clearDuelTarget(null, 'noWorthyTarget'); return false; }
    d.seq = next._seq;
    d.kind = next.isBoss ? 'boss' : 'elite';
    d.retargets += 1;
    this.telemetry.duelRetargets += 1;
    this._emit('duelRetarget', { seq: d.seq, kind: d.kind });
    return true;
  }
  serializeDuelState() {
    if (!this._duel) return null;
    const d = this._duel;
    // 敵オブジェクトは保存しない。安定 runtime id と残り時間・使用済み回数だけ。
    return {
      source: d.source, seq: d.seq, kind: d.kind, leftMs: d.leftMs, totalMs: d.totalMs,
      extendedMs: d.extendedMs, retargets: d.retargets,
      meleeDamageBonus: d.meleeDamageBonus, poiseDamageBonus: d.poiseDamageBonus,
      furyGainBonus: d.furyGainBonus, maxRetargets: d.maxRetargets,
      retargetRange: d.retargetRange, extendPerBreakMs: d.extendPerBreakMs, maxExtensionMs: d.maxExtensionMs,
    };
  }
  restoreDuelState(s) {
    this._duel = null;
    if (!s || !this.enabled) return null;
    const cfg = this.cfg.duel;
    const left = clamp(num(s.leftMs, 0), 0, num(cfg.maxDurationMs, 12000));
    if (left <= 0 || s.seq == null) return null;
    this._duel = {
      source: s.source || null, seq: s.seq, kind: s.kind || 'normal',
      leftMs: left, totalMs: clamp(num(s.totalMs, left), 0, num(cfg.maxDurationMs, 12000)),
      extendedMs: clamp(num(s.extendedMs, 0), 0, num(cfg.maxExtensionMs, 3600)),
      retargets: Math.max(0, Math.round(num(s.retargets, 0))),
      meleeDamageBonus: clamp(num(s.meleeDamageBonus, 0), 0, num(cfg.maxMeleeDamageBonus, 0.5)),
      poiseDamageBonus: clamp(num(s.poiseDamageBonus, 0), 0, num(cfg.maxPoiseDamageBonus, 0.6)),
      furyGainBonus: clamp(num(s.furyGainBonus, 0), 0, num(cfg.maxFuryGainBonus, 0.4)),
      maxRetargets: Math.max(0, Math.min(Math.round(num(s.maxRetargets, 0)), Math.round(num(cfg.maxRetargetsPerCast, 1)))),
      retargetRange: Math.max(0, num(s.retargetRange, 0)),
      extendPerBreakMs: Math.max(0, num(s.extendPerBreakMs, 0)),
      maxExtensionMs: clamp(num(s.maxExtensionMs, 0), 0, num(cfg.maxExtensionMs, 3600)),
    };
    return { ...this._duel };
  }

  // ================= M8-E: 修羅の構え（battle_trance / blood_asura_trance）=================
  // 攻撃寄りの timed stance。formal status ではなく本クラス上の状態として持ち、**重ねがけしない**。
  beginBattleTrance(source, o = {}) {
    if (!this.enabled || !source) return null;
    const cfg = this.cfg.trance;
    // 構えは data の本数上限まで（既定 1）。0 なら構えない。
    if (Math.max(0, num(cfg.maxStances, 1)) < 1) return null;
    const dur = clamp(num(o.durationMs, 0), 0, num(cfg.maxDurationMs, 10000));
    if (dur <= 0) return null;
    const t = {
      source, leftMs: dur, totalMs: dur,
      meleeDamageBonus: clamp(num(o.meleeDamageBonus, 0), 0, num(cfg.maxMeleeDamageBonus, 0.45)),
      attackSpeedBonus: clamp(num(o.attackSpeedBonus, 0), 0, num(cfg.maxAttackSpeedBonus, 0.32)),
      comboGraceBonus: clamp(num(o.comboGraceBonus, 0), 0, num(cfg.maxComboGraceBonus, 0.45)),
      furyGainBonus: clamp(num(o.furyGainBonus, 0), 0, num(cfg.maxFuryGainBonus, 0.5)),
      mitigationPenalty: clamp(num(o.mitigationPenalty, 0), 0, num(cfg.maxMitigationPenalty, 0.15)),
      killHealBonus: clamp(num(o.killHealBonus, 0), 0, num(cfg.maxKillHealBonus, 0.5)),
      perSecondCapBonus: clamp(num(o.perSecondCapBonus, 0), 0, num(cfg.maxKillHealBonus, 0.5)),
    };
    this._trance = t; // 上書き（stack しない）
    this.telemetry.tranceStarts += 1;
    this._emit('battleTrance', { ...t });
    return { ...t };
  }
  endBattleTrance(source) {
    if (!this._trance) return false;
    if (source && this._trance.source !== source) return false;
    this._trance = null;
    return true;
  }
  get tranceActive() { return !!this._trance && this._trance.leftMs > 0; }
  get tranceLeftMs() { return this._trance ? Math.max(0, this._trance.leftMs) : 0; }
  // 構えの攻撃補正。闘気解放と合わせた合成上限（combinedOffenseCap）で必ず頭打ちになる。
  getBattleTranceModifiers() {
    const none = { meleeDamage: 0, attackSpeed: 0, comboGrace: 0, furyGain: 0, mitigationPenalty: 0 };
    if (!this.tranceActive) return none;
    const t = this._trance;
    const cfg = this.cfg.trance;
    const cap = Math.max(0, num(cfg.combinedOffenseCap, 0.85));
    // 闘気解放中は既にダメージ倍率が乗っているので、その分を差し引いた余地までしか乗せない。
    const releaseBonus = this.releaseActive ? Math.max(0, num(this.cfg.furyRelease.meleeDamageMult, 1) - 1) : 0;
    const room = Math.max(0, cap - releaseBonus);
    const melee = Math.min(t.meleeDamageBonus, room);
    if (melee < t.meleeDamageBonus - 1e-9) this.telemetry.tranceOffenseCapped += 1;
    return {
      meleeDamage: melee, attackSpeed: t.attackSpeedBonus, comboGrace: t.comboGraceBonus,
      furyGain: t.furyGainBonus, mitigationPenalty: t.mitigationPenalty,
    };
  }
  serializeTimedStance() {
    if (!this._trance) return null;
    return { ...this._trance };
  }
  restoreTimedStance(s) {
    this._trance = null;
    if (!s || !this.enabled) return null;
    return this.beginBattleTrance(s.source || 'restored', {
      durationMs: s.leftMs, meleeDamageBonus: s.meleeDamageBonus, attackSpeedBonus: s.attackSpeedBonus,
      comboGraceBonus: s.comboGraceBonus, furyGainBonus: s.furyGainBonus,
      mitigationPenalty: s.mitigationPenalty, killHealBonus: s.killHealBonus,
      perSecondCapBonus: s.perSecondCapBonus,
    });
  }

  // ================= M8-E: 震天踏破（earthshaker_march / continental_quake_march）=================
  beginEarthshakerMarch(o = {}) {
    if (!this.enabled) return null;
    const cfg = this.cfg.march;
    const stomps = Math.max(1, Math.min(Math.round(num(o.stompCount, 1)), Math.round(num(cfg.maxStomps, 8))));
    return {
      stomps,
      intervalMs: Math.max(40, num(o.intervalMs, 160)),
      stepDistance: clamp(num(o.stepDistance, 0), 0, num(cfg.maxStepDistance, 96)),
      radius: clamp(num(o.radius, 0), 0, num(cfg.maxRadius, 170)),
      maxMs: clamp(num(o.maxMs, num(cfg.maxMarchMs, 2600)), 0, num(cfg.maxMarchMs, 2600)),
      mitigation: clamp(num(o.mitigation, 0), 0, num(cfg.maxMitigation, 0.2)),
      worldMargin: Math.max(0, num(cfg.worldMargin, 24)),
    };
  }
  // 1 踏みぶんの記録（最終踏みだけ別に数える）。damage 自体は共通経路 meleeStrike が扱う。
  resolveMarchStomp(index, total, distance) {
    if (!this.enabled) return { final: false };
    const final = (index + 1) >= total;
    this.telemetry.marchStomps += 1;
    this.telemetry.marchDistance += Math.max(0, num(distance, 0));
    if (final) { this.telemetry.marchFinalStomps += 1; this.telemetry.marchCompleted += 1; }
    return { final };
  }

  // ================= M8-E: 弾き返し（weapon_deflection / heaven_mirror_reversal）=================
  // 通常の敵弾だけを限定数だけ弾く。予兆 / 光条 / 地形ハザード / DoT は弾かない（allowlist + denylist）。
  beginDeflectionWindow(source, o = {}) {
    if (!this.enabled || !source) return null;
    const cfg = this.cfg.deflection;
    const dur = clamp(num(o.windowMs, 0), 0, num(cfg.maxWindowMs, 3000));
    if (dur <= 0) return null;
    this._deflect = {
      source, leftMs: dur, totalMs: dur, used: 0,
      max: Math.max(1, Math.min(Math.round(num(o.maxDeflections, 1)), Math.round(num(cfg.maxDeflectionsPerWindow, 8)))),
      radius: clamp(num(o.radius, 0), 0, num(cfg.maxDeflectRadius, 150)),
      reflect: o.reflect !== false,
      reflectedDamage: clamp(num(o.reflectedDamage, 0), 0, num(cfg.maxReflectedDamage, 96)),
      reflectedSpeed: clamp(num(o.reflectedSpeed, 0), 0, num(cfg.maxReflectedSpeed, 480)),
      reflectLifeMs: clamp(num(o.reflectLifeMs, 0), 0, num(cfg.maxReflectLifeMs, 1000)),
      poiseDamage: Math.max(0, num(o.poiseDamage, 0)),
      counters: 0,
    };
    this._deflectedIds.clear();
    this.telemetry.deflectWindows += 1;
    this._emit('deflectionWindow', { durationMs: dur, max: this._deflect.max });
    return { ...this._deflect };
  }
  endDeflectionWindow(source) {
    if (!this._deflect) return false;
    if (source && this._deflect.source !== source) return false;
    this._deflect = null;
    this._deflectedIds.clear();
    return true;
  }
  get deflectionActive() { return !!this._deflect && this._deflect.leftMs > 0 && this._deflect.used < this._deflect.max; }
  // 「窓が開いているか」だけを見る（残り枠は見ない）。枠を使い切った窓へ飛んできた弾も
  // 調停までは通し、canDeflectProjectile が capReached として正しく数えられるようにする。
  get deflectionWindowOpen() { return !!this._deflect && this._deflect.leftMs > 0; }
  deflectionState(source) { return this._deflect && (!source || this._deflect.source === source) ? { ...this._deflect } : null; }
  get deflectLeftMs() { return this._deflect ? Math.max(0, this._deflect.leftMs) : 0; }
  get deflectUsed() { return this._deflect ? this._deflect.used : 0; }
  get deflectMax() { return this._deflect ? this._deflect.max : 0; }
  // 弾ける弾かどうかを 1 か所で判定する。スキル側は projectileKind を直接見ない。
  canDeflectProjectile(proj) {
    if (!this.enabled || !this._deflect || this._deflect.leftMs <= 0) return { ok: false, reason: 'noWindow' };
    if (this._deflect.used >= this._deflect.max) return { ok: false, reason: 'capReached' };
    if (!proj || proj.alive === false) return { ok: false, reason: 'invalid' };
    if (!proj.hostile) return { ok: false, reason: 'notHostile' };          // 味方弾は弾かない
    if (proj.alreadyDeflected) return { ok: false, reason: 'alreadyDeflected' };
    const cfg = this.cfg.deflection;
    // 反射弾から再反射しない（印が落ちていても世代だけで必ず止まる）。
    if (num(proj.deflectGeneration, 0) >= num(cfg.maxReflectGeneration, 1)) {
      return { ok: false, reason: 'generation' };
    }
    if (proj.isTelegraph) return { ok: false, reason: 'telegraph' };
    if (proj.isBeam) return { ok: false, reason: 'beam' };
    const kind = proj.projectileKind || 'bossBullet';
    const denied = cfg.deniedKinds || [];
    if (denied.includes(kind)) return { ok: false, reason: 'deniedKind' };
    const allowed = cfg.allowedKinds || [];
    if (allowed.length > 0 && !allowed.includes(kind)) return { ok: false, reason: 'notAllowedKind' };
    const id = proj._deflectId != null ? proj._deflectId : null;
    if (id != null && this._deflectedIds.has(id)) return { ok: false, reason: 'sameProjectile' };
    return { ok: true, reason: 'deflect' };
  }
  // 実際に 1 発弾く（成立したら true）。弾の消去 / 反射弾の生成は BattleScene 側が行う。
  tryDeflectProjectile(proj) {
    this.telemetry.deflectSeen += 1;
    const pol = this.canDeflectProjectile(proj);
    if (!pol.ok) {
      this.telemetry.deflectRejected += 1;
      if (pol.reason === 'capReached') this.telemetry.deflectCapReached += 1;
      return { deflected: false, reason: pol.reason };
    }
    this._deflect.used += 1;
    if (proj._deflectId != null) this._deflectedIds.add(proj._deflectId);
    this.telemetry.deflected += 1;
    const d = this._deflect;
    return {
      deflected: true, reason: 'deflect',
      reflect: d.reflect && d.reflectedDamage > 0,
      damage: d.reflectedDamage, speed: d.reflectedSpeed, lifeMs: d.reflectLifeMs,
      poiseDamage: d.poiseDamage,
      remaining: Math.max(0, d.max - d.used),
    };
  }
  noteReflectedSpawn() { if (this.enabled) this.telemetry.reflectedSpawned += 1; }
  noteReflectedHit(damage) {
    if (!this.enabled) return;
    this.telemetry.reflectedHits += 1;
    this.telemetry.reflectedDamage += Math.max(0, num(damage, 0));
  }
  // 反射弾の上限（世代・同時数）。反射弾から再反射しないための唯一の判断場所。
  maxReflectGeneration() { return Math.max(0, Math.round(num(this.cfg.deflection.maxReflectGeneration, 1))); }

  // 1 つの被弾 / 弾イベントに対して反応するのは最大 1 系統（弾き返し or 反撃）。
  // 弾き返しのほうが優先度が高い（data の counterPriority）。同フレームでも各上限は別々に守られる。
  arbitrateDeflectionAndCounter(kind) {
    if (!this.enabled) return null;
    const cfg = this.cfg.deflection;
    if (kind === 'projectile') {
      // 弾イベントは弾き返しだけが応じる（melee counter は消費しない）。
      // 枠を使い切っていても窓が開いていれば調停は通す（上限到達を計測できるようにするため。
      // 実際に弾けるかどうかは canDeflectProjectile が決め、失敗しても何も消費しない）。
      if (!this.deflectionWindowOpen) return null;
      this.telemetry.reactionArbitrated += 1;
      return { kind: 'deflect', priority: Math.max(0, num(cfg.counterPriority, 4)) };
    }
    // 近接被弾は既存の反撃調停へそのまま渡す（弾き返しは消費しない）。
    const pick = this.consumeCounterEvent();
    if (pick) this.telemetry.reactionArbitrated += 1;
    return pick ? { kind: 'counter', source: pick.source, priority: pick.priority } : null;
  }
  noteMirrorCounter() {
    if (!this.enabled || !this._deflect) return;
    this._deflect.counters += 1;
    this.telemetry.mirrorCounters += 1;
  }
  serializeDeflectionState() {
    if (!this._deflect) return null;
    const d = this._deflect;
    // 弾のオブジェクトも id 集合も保存しない（reload 後に過去の弾を復活させない）。
    return {
      source: d.source, leftMs: d.leftMs, totalMs: d.totalMs, used: d.used, max: d.max,
      radius: d.radius, reflect: d.reflect, reflectedDamage: d.reflectedDamage,
      reflectedSpeed: d.reflectedSpeed, reflectLifeMs: d.reflectLifeMs,
      poiseDamage: d.poiseDamage, counters: d.counters,
    };
  }
  restoreDeflectionState(s) {
    this._deflect = null;
    this._deflectedIds.clear();
    if (!s || !this.enabled) return null;
    const r = this.beginDeflectionWindow(s.source || 'restored', {
      windowMs: s.leftMs, maxDeflections: s.max, radius: s.radius, reflect: s.reflect,
      reflectedDamage: s.reflectedDamage, reflectedSpeed: s.reflectedSpeed,
      reflectLifeMs: s.reflectLifeMs, poiseDamage: s.poiseDamage,
    });
    if (!r) return null;
    // 使用済み回数と反撃使用状況を引き継ぐ（reload で上限をリセットして稼げない）。
    this._deflect.used = Math.max(0, Math.min(Math.round(num(s.used, 0)), this._deflect.max));
    this._deflect.counters = Math.max(0, Math.round(num(s.counters, 0)));
    // 復元は新規 window として数えない（0 未満へは下げない）。
    this.telemetry.deflectWindows = Math.max(0, this.telemetry.deflectWindows - 1);
    return { ...this._deflect };
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
  // M8-E: 決闘対象へだけ乗る体勢削りの上乗せ（対象以外は 1 倍＝恒等）。
  duelPoiseMultiplier(target) { return 1 + this.getDuelModifiers(target).poiseDamage; }

  applyPoiseDamage(target, amount) {
    if (!this.enabled || !target || !target.alive) return null;
    const amt = Math.max(0, num(amount, 0)) * this.poiseDamageMultiplier() * this.duelPoiseMultiplier(target);
    if (amt <= 0) return null;
    this.telemetry.poiseDamage += amt;
    let r = null;
    if (target.isBoss) r = this._bossPoise(target, amt);
    else if (target.isElite) r = this._elitePoise(target, amt);
    else return null; // 通常敵はゲージを持たない
    // M8-E: 決闘対象の構えを崩したときだけ、決闘時間を小幅延長する（合計上限つき・進化のみ）。
    if (r && (r.type === 'eliteStagger' || r.type === 'bossStanceBreak')) this.noteDuelStanceBreak(target);
    return r;
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
    // M8-D: 前面防御（時間切れで必ず消える）。
    if (this.frontGuard.leftMs > 0) {
      this.frontGuard.leftMs = Math.max(0, this.frontGuard.leftMs - d);
      this.telemetry.frontGuardUptimeMs += d;
      if (this.frontGuard.leftMs === 0) this.endFrontGuard(this.frontGuard.source);
    }
    // M8-D: 掴み（時間切れで必ず解除される＝掴みっぱなしにならない）。
    if (this._grab) {
      this._grab.leftMs = Math.max(0, this._grab.leftMs - d);
      if (this._grab.leftMs === 0) this.endGrab(this._grab.source, true);
    }
    // M8-D: 戦旗の陣（時間切れで消える。内外の判定はスキル側が毎フレーム更新する）。
    if (this.rallyField) {
      this.rallyField.leftMs = Math.max(0, this.rallyField.leftMs - d);
      this.telemetry.rallyUptimeMs += d;
      if (this._rallyInside) this.telemetry.rallyInsideMs += d;
      if (this.rallyField.leftMs === 0) { this.rallyField = null; this._rallyInside = false; this._emit('rallyFieldEnd', {}); }
    }
    // M8-E: 決闘（時間切れで必ず解除される）。
    if (this._duel) {
      this._duel.leftMs = Math.max(0, this._duel.leftMs - d);
      this.telemetry.duelUptimeMs += d;
      if (this._duel.leftMs === 0) this.clearDuelTarget(null, 'expired');
    }
    // M8-E: 修羅の構え（時間切れで必ず消える＝永続化しない）。
    if (this._trance) {
      this._trance.leftMs = Math.max(0, this._trance.leftMs - d);
      this.telemetry.tranceUptimeMs += d;
      this.telemetry.tranceDamageBonusSum += this._trance.meleeDamageBonus;
      if (this._trance.leftMs === 0) { this._trance = null; this._emit('battleTranceEnd', {}); }
    }
    // M8-E: 弾き返しの window（時間切れ・使い切りで必ず閉じる）。
    if (this._deflect) {
      this._deflect.leftMs = Math.max(0, this._deflect.leftMs - d);
      this.telemetry.deflectUptimeMs += d;
      if (this._deflect.leftMs === 0) { this._deflect = null; this._deflectedIds.clear(); this._emit('deflectionWindowEnd', {}); }
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
      // M8-D: Wave2（前面防御 / 戦旗の陣）。掴みは途中状態を保存しない（再開時の二重投げを防ぐ）。
      frontGuard: this.frontGuard.leftMs > 0 ? { ...this.frontGuard } : null,
      rallyField: this.rallyField ? { ...this.rallyField } : null,
      counterGlobalCdLeftMs: this._counterGlobalCdLeftMs,
      // M8-E: 最終 Wave。決闘は安定 runtime id だけ、弾き返しは残り時間と使用済み回数だけを保存する。
      // 敵 / 弾のオブジェクトも、弾いた弾の id 集合も保存しない。
      duel: this.serializeDuelState(),
      trance: this.serializeTimedStance(),
      deflection: this.serializeDeflectionState(),
    };
  }
  restoreTimedBuffs(s) {
    this.warCry = { leftMs: 0, meleeDamageBonus: 0, furyGainBonus: 0, comboGraceBonus: 0 };
    this.counterWindows = new Map();
    // M8-D: Wave2（掴みは復元しない＝再開で無料の投げを作らない）。
    this.frontGuard = { leftMs: 0, mitigation: 0, arc: 0, facing: 0, source: null };
    this.rallyField = null;
    this._rallyInside = false;
    this._grab = null;
    // M8-E: 決闘 / 構え / 弾き返しも一度すべて落としてから復元する。
    this._duel = null;
    this._trance = null;
    this._deflect = null;
    this._deflectedIds.clear();
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
    // M8-D: 前面防御（残り時間と軽減値だけ・上限クランプを通す）。
    const fg = s.frontGuard;
    if (fg && typeof fg === 'object' && num(fg.leftMs, 0) > 0 && num(fg.arc, 0) > 0) {
      this.frontGuard = {
        leftMs: Math.max(0, num(fg.leftMs, 0)),
        mitigation: clamp(num(fg.mitigation, 0), 0, num(this.cfg.frontalGuard.maxFrontalMitigation, 0.55)),
        arc: Math.max(0, num(fg.arc, 0)), facing: num(fg.facing, 0),
        source: typeof fg.source === 'string' ? fg.source : null,
      };
    }
    // M8-D: 戦旗の陣（必ず 1 つだけ復元する。壊れた保存は上限でクランプする）。
    const rf = s.rallyField;
    if (rf && typeof rf === 'object' && num(rf.leftMs, 0) > 0 && num(rf.radius, 0) > 0
      && isFiniteNum(rf.x) && isFiniteNum(rf.y)) {
      this.placeRallyField(typeof rf.source === 'string' ? rf.source : 'rallying_banner', {
        x: rf.x, y: rf.y, durationMs: rf.leftMs, radius: rf.radius,
        comboGrace: rf.comboGrace, furyGain: rf.furyGain, mitigation: rf.mitigation,
        meleeArea: rf.meleeArea, killHealBonus: rf.killHealBonus, perSecondCapBonus: rf.perSecondCapBonus,
      });
      // 復元は「置き直し」ではないので設置回数を戻す（テレメトリの水増しを防ぐ）。
      this.telemetry.rallyPlacements = Math.max(0, this.telemetry.rallyPlacements - 1);
    }
    // M8-E: 決闘 / 修羅の構え / 弾き返し（いずれも上限クランプを通す）。
    this.restoreDuelState(s.duel);
    this.restoreTimedStance(s.trance);
    this.restoreDeflectionState(s.deflection);
    // 復元は新規発動として数えない。構えだけは beginBattleTrance 経由なので 1 戻す
    // （決闘 / 弾き返しはそれぞれの restore が最初から数えていない）。
    if (this._trance) this.telemetry.tranceStarts = Math.max(0, this.telemetry.tranceStarts - 1);
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
      launches: t.launches, launchBlocked: t.launchBlocked, launchPoiseConverted: t.launchPoiseConverted,
      frontGuardUptimeMs: t.frontGuardUptimeMs, frontGuardBlocked: t.frontGuardBlocked,
      frontGuardSideHits: t.frontGuardSideHits, frontGuardBackHits: t.frontGuardBackHits,
      grabs: t.grabs, grabRefused: t.grabRefused, grabCancels: t.grabCancels,
      throwImpacts: t.throwImpacts, throwDistance: t.throwDistance,
      comboStages: t.comboStages, guardTicks: t.guardTicks, guardUptimeMs: t.guardUptimeMs,
      lowHpBonusSum: t.lowHpBonusSum, lowHpBonusSamples: t.lowHpBonusSamples,
      axeOutboundHits: t.axeOutboundHits, axeReturnHits: t.axeReturnHits,
      stepIns: t.stepIns, stepInDistance: t.stepInDistance,
      // M8-E: 最終 Wave。
      lineThrusts: t.lineThrusts, linePenetrations: t.linePenetrations, lineToughHits: t.lineToughHits, lineStepIns: t.lineStepIns,
      duelStarts: t.duelStarts, duelBoss: t.duelBoss, duelElite: t.duelElite, duelNormal: t.duelNormal,
      duelUptimeMs: t.duelUptimeMs, duelDamageBonusSum: t.duelDamageBonusSum, duelHits: t.duelHits,
      duelRetargets: t.duelRetargets, duelExtensions: t.duelExtensions, duelClears: t.duelClears,
      tranceStarts: t.tranceStarts, tranceUptimeMs: t.tranceUptimeMs, tranceDamageBonusSum: t.tranceDamageBonusSum,
      trancePenaltySum: t.trancePenaltySum, tranceSamples: t.tranceSamples,
      tranceOffenseCapped: t.tranceOffenseCapped, tranceKillHealBonus: t.tranceKillHealBonus,
      marchStomps: t.marchStomps, marchCompleted: t.marchCompleted, marchDistance: t.marchDistance, marchFinalStomps: t.marchFinalStomps,
      deflectWindows: t.deflectWindows, deflectUptimeMs: t.deflectUptimeMs, deflectSeen: t.deflectSeen,
      deflected: t.deflected, deflectRejected: t.deflectRejected, deflectCapReached: t.deflectCapReached,
      reflectedSpawned: t.reflectedSpawned, reflectedHits: t.reflectedHits, reflectedDamage: t.reflectedDamage,
      mirrorCounters: t.mirrorCounters, reactionArbitrated: t.reactionArbitrated,
      rallyPlacements: t.rallyPlacements, rallyUptimeMs: t.rallyUptimeMs, rallyInsideMs: t.rallyInsideMs,
      rallyAssists: t.rallyAssists, rallyKillHealBonus: t.rallyKillHealBonus,
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
    // M8-D: Wave2 の共通状態も残さない。
    this.frontGuard = { leftMs: 0, mitigation: 0, arc: 0, facing: 0, source: null };
    this.rallyField = null;
    this._rallyInside = false;
    this._grab = null;
    // M8-E: 決闘 / 構え / 弾き返しも残さない（Scene 終了・job 切替で持ち越さない）。
    this._duel = null;
    this._trance = null;
    this._deflect = null;
    this._deflectedIds.clear();
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
    // M8-D: 打ち上げ / 掴みの残留を落とす（掴んでいた相手が消えたら掴みも解除する）。
    e._airborneUntil = 0;
    e._launchImmuneUntil = 0;
    e._launchHeight = 0;
    if (this._grab && this._grab.seq === e._seq) this.endGrab(null, true);
    e._grabbed = false;
    // M8-E: 決闘対象が消えたら決闘も終わる（対象の残留マーカーも落とす）。
    if (this._duel && this._duel.seq === e._seq) this.clearDuelTarget(null, 'targetRemoved');
    e._duelMark = false;
    this._targetHitAt.delete(e);
  }

  // ボス死亡でボス体勢の状態を落とす（次のボスへ持ち越さない）。
  onBossRemoved() {
    this.bossPoise = { gauge: 0, thresholdMult: 1, breaks: 0, cooldownLeftMs: 0, exposedLeftMs: 0, reactionLeftMs: 0 };
    // M8-E: ボスと決闘していたなら、ボス消滅で決闘も終わる。
    if (this._duel && this._duel.kind === 'boss') this.clearDuelTarget(null, 'bossRemoved');
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
      // M8-D（Wave2）
      launches: t.launches, launchBlocked: t.launchBlocked, launchPoiseConverted: t.launchPoiseConverted,
      frontGuardUptimeSeconds: t.frontGuardUptimeMs / 1000, frontGuardBlocked: t.frontGuardBlocked,
      frontGuardSideHits: t.frontGuardSideHits, frontGuardBackHits: t.frontGuardBackHits,
      grabs: t.grabs, grabRefused: t.grabRefused, grabCancels: t.grabCancels,
      throwImpacts: t.throwImpacts, throwDistance: t.throwDistance,
      comboStages: t.comboStages, guardTicks: t.guardTicks, guardUptimeSeconds: t.guardUptimeMs / 1000,
      lowHpAvgMultiplier: t.lowHpBonusSamples > 0 ? t.lowHpBonusSum / t.lowHpBonusSamples : 0,
      axeOutboundHits: t.axeOutboundHits, axeReturnHits: t.axeReturnHits,
      stepIns: t.stepIns, stepInDistance: t.stepInDistance,
      rallyPlacements: t.rallyPlacements, rallyUptimeSeconds: t.rallyUptimeMs / 1000,
      // M8-E: 最終 Wave（外向きは秒 / 平均へ換算）。
      lineThrusts: t.lineThrusts, linePenetrations: t.linePenetrations, lineToughHits: t.lineToughHits, lineStepIns: t.lineStepIns,
      duelStarts: t.duelStarts, duelBoss: t.duelBoss, duelElite: t.duelElite, duelNormal: t.duelNormal,
      duelUptimeSeconds: t.duelUptimeMs / 1000, duelHits: t.duelHits,
      duelAvgDamageBonus: t.duelHits > 0 ? t.duelDamageBonusSum / t.duelHits : 0,
      duelRetargets: t.duelRetargets, duelExtensions: t.duelExtensions, duelClears: t.duelClears,
      duelActive: this.duelActive, duelKind: this.duelKind,
      tranceStarts: t.tranceStarts, tranceUptimeSeconds: t.tranceUptimeMs / 1000,
      tranceAvgDamageBonus: t.tranceSamples > 0 ? t.tranceDamageBonusSum / Math.max(1, t.tranceSamples) : 0,
      tranceAvgPenalty: t.tranceSamples > 0 ? t.trancePenaltySum / t.tranceSamples : 0,
      tranceOffenseCapped: t.tranceOffenseCapped, tranceKillHealBonus: t.tranceKillHealBonus,
      tranceActive: this.tranceActive,
      marchStomps: t.marchStomps, marchCompleted: t.marchCompleted, marchDistance: t.marchDistance, marchFinalStomps: t.marchFinalStomps,
      deflectWindows: t.deflectWindows, deflectUptimeSeconds: t.deflectUptimeMs / 1000,
      deflectSeen: t.deflectSeen, deflected: t.deflected, deflectRejected: t.deflectRejected,
      deflectCapReached: t.deflectCapReached, reflectedSpawned: t.reflectedSpawned,
      reflectedHits: t.reflectedHits, reflectedDamage: t.reflectedDamage,
      mirrorCounters: t.mirrorCounters, reactionArbitrated: t.reactionArbitrated,
      deflectionActive: this.deflectionActive,
      rallyInsideSeconds: t.rallyInsideMs / 1000, rallyAssists: t.rallyAssists,
      // 現在値（F8/F9 のライブ表示用。CombatTelemetry へは取り込まれない）。
      fury: this.fury, combo: this.combo, bossPoiseGauge: this.bossPoise.gauge,
      rallyActive: this.rallyActive, rallyInside: this._rallyInside, frontGuardActive: this.frontGuardActive,
    };
  }
}
