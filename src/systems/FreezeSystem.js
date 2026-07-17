// FreezeSystem（Milestone 7-A）: 冷気蓄積→減速、凍結確率、ボス氷砕ゲージ、粉砕ダメージの
// 純粋な数値計算を担う。Phaser/DOM 非依存で Node からテスト可能（Math.random は使わない）。
//
// 凍結確率式（仕様）:
//   freezeChance = baseFreezeChance × procCoefficient + (chill/chillCap) × chanceFromChill × procCoefficient
//   → 0以上・対象別 freezeChanceCap 以下にクランプ。chill >= guaranteedThreshold なら確定凍結。
// 乱数は StatusEffectManager が保持する状態異常専用 SeededRandom を渡す（cursor を active_run へ保存）。

function num(v, d = 0) { return (typeof v === 'number' && Number.isFinite(v)) ? v : d; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

export class FreezeSystem {
  // registry: StatusEffectRegistry。thresholdMods: 絶対零度(Lv100)の閾値低下・凍結延長（周回開始時に設定）。
  constructor(registry, thresholdMods = null) {
    this._reg = registry;
    // { normalThresholdReduction, bossThresholdReduction, frozenDurationMult } いずれも 0..1（低下率 / 延長率）。
    this._tm = thresholdMods || { normalThresholdReduction: 0, bossThresholdReduction: 0, frozenDurationMult: 0 };
  }

  setThresholdMods(tm) { this._tm = tm || { normalThresholdReduction: 0, bossThresholdReduction: 0, frozenDurationMult: 0 }; }

  freezeConfig() { return this._reg.freezeConfig(); }
  profile(entityType) { return this._reg.freezeProfile(entityType === 'elite' ? 'elite' : 'normal'); }

  // 冷気による減速率（0..maxSlow）。chill=0 で 0、chillCap で maxSlow。
  slowFactor(entityType, chill) {
    const p = this.profile(entityType);
    const cap = num(p.chillCap, 100);
    const maxSlow = num(p.maxSlow, 0);
    if (cap <= 0 || chill <= 0) return 0;
    const exp = num(this.freezeConfig().slowCurveExponent, 1);
    const ratio = clamp(chill / cap, 0, 1);
    return clamp(maxSlow * Math.pow(ratio, exp), 0, maxSlow);
  }

  // 確定凍結の閾値（絶対零度で低下・安全下限は chillCap を超えない範囲で維持）。
  guaranteedThreshold(entityType) {
    const p = this.profile(entityType);
    const base = num(p.guaranteedFreezeThreshold, num(p.chillCap, 100));
    const red = clamp(num(this._tm.normalThresholdReduction, 0), 0, 0.9);
    // 安全下限: chillCap の 50% 未満には下げない（完全な永久凍結を発生させない）。
    const floor = num(p.chillCap, 100) * 0.5;
    return Math.max(floor, base * (1 - red));
  }

  // 命中1回ぶんの凍結確率（クランプ後）。guaranteed の場合は { guaranteed:true }。
  computeFreezeChance(entityType, { baseFreezeChance = 0, procCoefficient = 1, chill = 0 } = {}) {
    const p = this.profile(entityType);
    const cap = num(p.chillCap, 100);
    const chanceCap = num(p.freezeChanceCap, 0.45);
    const chanceFromChill = num(this.freezeConfig().chanceFromChill, 0);
    if (chill >= this.guaranteedThreshold(entityType)) return { guaranteed: true, chance: 1 };
    const chillRatio = cap > 0 ? clamp(chill / cap, 0, 1) : 0;
    let chance = num(baseFreezeChance, 0) * num(procCoefficient, 1)
      + chillRatio * chanceFromChill * num(procCoefficient, 1);
    chance = clamp(chance, 0, chanceCap);
    return { guaranteed: false, chance };
  }

  // 凍結判定（決定論・rng は状態異常専用 SeededRandom）。
  rollFreeze(entityType, params, rng) {
    const r = this.computeFreezeChance(entityType, params);
    if (r.guaranteed) return true;
    if (r.chance <= 0) return false;
    const v = rng ? rng.next() : 1;
    return v < r.chance;
  }

  // 凍結持続時間（ms）。基礎×エリート倍率×絶対零度の延長。上限は maxDuration。
  freezeDuration(entityType) {
    const p = this.profile(entityType);
    const base = num(p.baseFreezeDuration, 1250);
    const eliteMult = num(p.freezeDurationMultiplier, 1);
    const azMult = 1 + clamp(num(this._tm.frozenDurationMult, 0), 0, 1);
    const dur = base * eliteMult * azMult;
    const maxDur = this._reg.maxDurationOf('frozen') || 4000;
    return Math.min(dur, maxDur);
  }

  postFreezeImmunity(entityType) { return num(this.profile(entityType).postFreezeImmunity, 1200); }
  chillCap(entityType) { return num(this.profile(entityType).chillCap, 100); }
  chillGainMultiplier(entityType) { return num(this.profile(entityType).chillGainMultiplier, 1); }
  immunityChillGainMultiplier(entityType) { return num(this.profile(entityType).immunityChillGainMultiplier, 0.25); }
  decayRate(entityType) { return num(this.profile(entityType).decayRate, num(this.freezeConfig().chillDecayGraceMs, 0) ? 12 : 12); }

  shatterConfig() { return this._reg.shatterConfig(); }

  // ---- ボス氷砕ゲージ ----
  bossConfig() { return this._reg.bossFrostbreakConfig(); }

  // break 回数 breaks 時点で必要なゲージ閾値（成長・上限・絶対零度低下・安全下限）。
  bossThreshold(breaks = 0) {
    const c = this.bossConfig();
    const base = num(c.baseThreshold, 250);
    const growth = num(c.thresholdGrowthPerBreak, 1.3);
    const maxMult = num(c.maximumThresholdMultiplier, 3);
    const minTh = num(c.minThreshold, 120);
    const red = clamp(num(this._tm.bossThresholdReduction, 0), 0, 0.9);
    let mult = Math.pow(growth, Math.max(0, breaks));
    mult = Math.min(mult, maxMult); // thresholdGrowth 自体は変えず、上限のみ maximumThresholdMultiplier
    const th = base * mult * (1 - red);
    return Math.max(minTh, th);
  }

  // ---- 粉砕ダメージ（固定＋スキル威力係数＋最大HP係数・上限つき。最大HP割合だけで無制限にしない） ----
  shatterDamage({ skillPower = 0, maxHp = 0, powerMult = 1 } = {}) {
    const s = this._reg.shatterConfig();
    const baseDmg = num(s.baseDamage, 30);
    const skillCoef = num(s.skillPowerCoefficient, 1);
    const hpCoef = num(s.maxHpCoefficient, 0);
    const hpCap = num(s.maxHpDamageCap, 120);
    const absCap = num(s.absoluteCap, 600);
    const hpPart = Math.min(num(maxHp, 0) * hpCoef, hpCap);
    const dmg = (baseDmg + num(skillPower, 0) * skillCoef + hpPart) * num(powerMult, 1);
    return clamp(dmg, 0, absCap);
  }
}
