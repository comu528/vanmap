// profile / settings のスキーマ定義と移行（Milestone 5-B で SaveManager から分離）。
// DOM / localStorage に依存しない純粋な関数のみ（Node からも import してテストできる）。
//
// save_version 移行方針:
//  - profile は旧版（v1〜v4）を明示的にフィールドマッピングして最新スキーマ（v5）へ移行する。
//    未知/不足フィールドは安全な既定値。旧データの余分なキーは持ち越さない（＝ import 時の
//    プロトタイプ汚染や不正キーの混入も、既知フィールドのみ読むことで自然に無害化される）。

export const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
export const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
export const arr = (v) => (Array.isArray(v) ? v : null);

export function defaultProfile(saveVersion, gameVersion) {
  const nowIso = new Date().toISOString();
  return {
    save_version: saveVersion || 1,
    game_version: gameVersion || '0.0.0',
    created_at: nowIso,
    updated_at: nowIso,
    embers: 0,
    lifetimeEmbers: 0,
    permanentUpgrades: {},
    selectedDifficulty: 1,
    unlockedDifficulties: [1],
    highestClearedDifficulty: 0,
    skillMastery: {},
    statistics: {
      totalPlayTime: 0, totalRuns: 0, totalWins: 0, totalDefeats: 0,
      totalKills: 0, totalBossKills: 0, highestDamage: 0,
    },
    lastResultId: null,
    // --- Milestone 4: 転生・魂炎 ---
    reincarnationCount: 0,
    soulflame: 0,
    lifetimeSoulflame: 0,
    reincarnationUpgrades: {},
    highestEverDifficulty: 0,
    lastReincarnationId: null,
    reincarnationHistory: [],
    unlockedFeatures: {},
    evolutionStatistics: {},
    currentCycle: {
      cycleNumber: 0, cycleEmbers: 0, cycleHighestDifficulty: 0,
      cycleBossKills: 0, cycleStartTime: nowIso,
    },
    achievements: [],
    // --- Milestone 6-A: ジョブ・パッシブ ---
    selectedJobId: 'flame_witch',
    unlockedJobs: ['flame_witch'],
    jobProgress: {},               // jobId -> { runs, ... }（将来のジョブ育成特典用）
    passiveMastery: {},            // id -> { runsUsed, maxLevel, picks, appliedTimeMs }
    futureInheritanceSettings: {}, // 将来の継承枠設定（M6-A は未使用の拡張口）
    // --- Milestone 6-F: ローカル戦闘バランス計測（外部送信なし・加算的・上限あり） ---
    balanceTelemetry: {
      enabled: true,
      summaryBySkill: {},          // skillId -> 集計（runs/totalDamage/totalDps/...）
      recentRuns: [],              // 最新の詳細周回（最大10件・古いものは集計後破棄）
      debugRuns: [],               // デバッグ周回（通常統計と分離・最大10件）
    },
  };
}

// 数値マップ（id -> level 等）を安全に取り込む。プロトタイプ汚染キーを除外し、有限数のみ通す。
function safeNumberMap(src, { min = -Infinity, max = Infinity, integer = false } = {}) {
  const out = {};
  const s = obj(src);
  for (const k of Object.keys(s)) {
    if (k === '__proto__' || k === 'prototype' || k === 'constructor') continue;
    let v = s[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    if (integer) v = Math.trunc(v);
    if (v < min) v = min;
    if (v > max) v = max;
    out[k] = v;
  }
  return out;
}

// skillMastery を型安全に取り込む（各エントリの数値のみ）。
function safeMastery(src) {
  const out = {};
  const s = obj(src);
  for (const k of Object.keys(s)) {
    if (k === '__proto__' || k === 'prototype' || k === 'constructor') continue;
    const e = obj(s[k]);
    out[k] = {
      casts: num(e.casts, 0), hits: num(e.hits, 0), kills: num(e.kills, 0),
      damage: num(e.damage, 0), maxLevel: num(e.maxLevel, 1),
      runsUsed: num(e.runsUsed, 0), evolutions: num(e.evolutions, 0),
    };
  }
  return out;
}

// 旧版 profile（v1〜v4）を最新スキーマ（sv）へ明示マッピングで移行する。
// 外部から取り込んだ未知データ（JSON インポート）にも同じ経路を通し、既知フィールドのみを採用する。
export function migrateProfile(stored, sv, gv) {
  const s = obj(stored);
  const m = defaultProfile(sv, gv);
  m.created_at = (typeof s.created_at === 'string' && s.created_at) || m.created_at;
  m.embers = Math.max(0, num(s.embers, num(obj(s.currencies).ember, 0)));
  m.lifetimeEmbers = Math.max(m.embers, num(s.lifetimeEmbers, m.embers));
  m.permanentUpgrades = safeNumberMap(s.permanentUpgrades, { min: 0, integer: true });
  m.unlockedDifficulties = (arr(s.unlockedDifficulties) || arr(s.difficultyUnlocked) || [1])
    .filter((n) => typeof n === 'number' && Number.isFinite(n));
  if (!m.unlockedDifficulties.includes(1)) m.unlockedDifficulties.unshift(1);
  m.selectedDifficulty = num(s.selectedDifficulty, 1);
  m.highestClearedDifficulty = Math.max(0, num(s.highestClearedDifficulty, 0));
  m.skillMastery = safeMastery(s.skillMastery);
  const os = obj(s.statistics);
  const legacy = obj(s.stats);
  m.statistics = {
    totalPlayTime: Math.max(0, num(os.totalPlayTime, 0)),
    totalRuns: Math.max(0, num(os.totalRuns, num(legacy.runs, 0))),
    totalWins: Math.max(0, num(os.totalWins, 0)),
    totalDefeats: Math.max(0, num(os.totalDefeats, 0)),
    totalKills: Math.max(0, num(os.totalKills, num(legacy.kills, 0))),
    totalBossKills: Math.max(0, num(os.totalBossKills, num(legacy.bossKills, 0))),
    highestDamage: Math.max(0, num(os.highestDamage, 0)),
  };
  m.lastResultId = (typeof s.lastResultId === 'string') ? s.lastResultId : null;
  // v4 の転生系（v3 以前は既定 0 / 空）。currencies.soulflame（前方互換）も拾う。
  m.reincarnationCount = Math.max(0, num(s.reincarnationCount, 0));
  m.soulflame = Math.max(0, num(s.soulflame, num(obj(s.currencies).soulflame, 0)));
  m.lifetimeSoulflame = Math.max(m.soulflame, num(s.lifetimeSoulflame, m.soulflame));
  m.reincarnationUpgrades = safeNumberMap(s.reincarnationUpgrades, { min: 0, integer: true });
  m.highestEverDifficulty = Math.max(0, num(s.highestEverDifficulty, m.highestClearedDifficulty));
  m.lastReincarnationId = (typeof s.lastReincarnationId === 'string') ? s.lastReincarnationId : null;
  m.reincarnationHistory = (arr(s.reincarnationHistory) || []).slice(-50);
  m.unlockedFeatures = obj(s.unlockedFeatures);
  m.evolutionStatistics = obj(s.evolutionStatistics);
  const cc = obj(s.currentCycle);
  m.currentCycle = {
    cycleNumber: num(cc.cycleNumber, m.reincarnationCount),
    cycleEmbers: Math.max(0, num(cc.cycleEmbers, 0)),
    cycleHighestDifficulty: Math.max(0, num(cc.cycleHighestDifficulty, 0)),
    cycleBossKills: Math.max(0, num(cc.cycleBossKills, 0)),
    cycleStartTime: (typeof cc.cycleStartTime === 'string' && cc.cycleStartTime) || m.created_at,
  };
  m.achievements = arr(s.achievements) || [];
  // v6: ジョブ・パッシブ（v5 以前は既定値）。
  m.selectedJobId = (typeof s.selectedJobId === 'string' && s.selectedJobId) || 'flame_witch';
  m.unlockedJobs = (arr(s.unlockedJobs) || ['flame_witch']).filter((x) => typeof x === 'string');
  if (!m.unlockedJobs.includes('flame_witch')) m.unlockedJobs.unshift('flame_witch');
  m.jobProgress = safeJobProgress(s.jobProgress);
  m.passiveMastery = safePassiveMastery(s.passiveMastery);
  m.futureInheritanceSettings = obj(s.futureInheritanceSettings);
  m.balanceTelemetry = safeBalanceTelemetry(s.balanceTelemetry); // M6-F: 加算的・上限あり（save_version は v6 維持）
  return m;
}

// balanceTelemetry を型安全に取り込む（M6-F）。外部インポートでも既知フィールドのみ・件数上限・有限数のみ。
// テレメトリの破損でゲーム進行や profile を壊さない（常に安全な既定へフォールバック）。
function safeBalanceTelemetry(src) {
  const s = obj(src);
  const cap = (list, n) => (arr(list) || []).filter((v) => v && typeof v === 'object' && !Array.isArray(v)).slice(0, n);
  const summary = {};
  const bs = obj(s.summaryBySkill);
  let count = 0;
  for (const k of Object.keys(bs)) {
    if (k === '__proto__' || k === 'prototype' || k === 'constructor') continue;
    if (count++ >= 80) break; // 集計スキル数の上限
    const e = obj(bs[k]);
    const clean = {};
    for (const [ek, ev] of Object.entries(e)) if (typeof ev === 'number' && Number.isFinite(ev)) clean[ek] = ev;
    summary[k] = clean;
  }
  return {
    enabled: typeof s.enabled === 'boolean' ? s.enabled : true,
    summaryBySkill: summary,
    recentRuns: cap(s.recentRuns, 10),
    debugRuns: cap(s.debugRuns, 10),
  };
}

// jobProgress を型安全に取り込む（Milestone 6-C）。ジョブごとの育成データ（totalXp が唯一の正）。
// 表示レベルは totalXp から都度算出するため保存しない。旧セーブ（jobProgress 無し）は空 → 各ジョブ totalXp=0 開始。
// 転生でリセットしない（維持）。プロトタイプ汚染キーを除外し、有限数のみ通す。
function safeJobProgress(src) {
  const out = {};
  const s = obj(src);
  for (const k of Object.keys(s)) {
    if (k === '__proto__' || k === 'prototype' || k === 'constructor') continue;
    const e = obj(s[k]);
    const ids = arr(e.awardedRunIds) || [];
    out[k] = {
      totalXp: Math.max(0, num(e.totalXp, 0)),
      runs: Math.max(0, num(e.runs, 0)),
      wins: Math.max(0, num(e.wins, 0)),
      losses: Math.max(0, num(e.losses, 0)),
      totalSurvivalSeconds: Math.max(0, num(e.totalSurvivalSeconds, 0)),
      totalKills: Math.max(0, num(e.totalKills, 0)),
      eliteKills: Math.max(0, num(e.eliteKills, 0)),
      bossKills: Math.max(0, num(e.bossKills, 0)),
      highestBattleLevel: Math.max(0, num(e.highestBattleLevel, 0)),
      highestDifficultyPlayed: Math.max(0, num(e.highestDifficultyPlayed, 0)),
      highestDifficultyCleared: Math.max(0, num(e.highestDifficultyCleared, 0)),
      totalEvolutions: Math.max(0, num(e.totalEvolutions, 0)),
      lastPlayedAt: (typeof e.lastPlayedAt === 'string') ? e.lastPlayedAt : null,
      lastXpGain: Math.max(0, num(e.lastXpGain, 0)),
      lastAwardedRunId: (typeof e.lastAwardedRunId === 'string') ? e.lastAwardedRunId : null,
      awardedRunIds: ids.filter((x) => typeof x === 'string').slice(-40),
    };
  }
  return out;
}

// passiveMastery を型安全に取り込む（ダメージ統計は持たせない）。
function safePassiveMastery(src) {
  const out = {};
  const s = obj(src);
  for (const k of Object.keys(s)) {
    if (k === '__proto__' || k === 'prototype' || k === 'constructor') continue;
    const e = obj(s[k]);
    out[k] = {
      runsUsed: num(e.runsUsed, 0), maxLevel: num(e.maxLevel, 0),
      picks: num(e.picks, 0), appliedTimeMs: num(e.appliedTimeMs, 0),
    };
  }
  return out;
}

// 同版でも欠落フィールドを安全に補完する（部分破損対策）。
export function fillProfileDefaults(p, sv, gv) {
  const d = defaultProfile(sv, gv);
  return {
    ...d, ...obj(p),
    statistics: { ...d.statistics, ...obj(obj(p).statistics) },
    currentCycle: { ...d.currentCycle, ...obj(obj(p).currentCycle) },
    balanceTelemetry: { ...d.balanceTelemetry, ...obj(obj(p).balanceTelemetry) },
  };
}

export function defaultSettings() {
  return {
    effectQuality: 'high',
    damageNumbers: true,
    screenShake: true,
    whiteFlash: true,
    autoMove: false,
    speed: 1,
  };
}

// 設定の安全な取り込み（既定値へマージし、型を検証）。
export function coerceSettings(src) {
  const d = defaultSettings();
  const s = obj(src);
  const q = s.effectQuality;
  return {
    effectQuality: (q === 'low' || q === 'medium' || q === 'high' || q === 'ultra') ? q : d.effectQuality,
    damageNumbers: typeof s.damageNumbers === 'boolean' ? s.damageNumbers : d.damageNumbers,
    screenShake: typeof s.screenShake === 'boolean' ? s.screenShake : d.screenShake,
    whiteFlash: typeof s.whiteFlash === 'boolean' ? s.whiteFlash : d.whiteFlash,
    autoMove: typeof s.autoMove === 'boolean' ? s.autoMove : d.autoMove,
    speed: (s.speed === 1 || s.speed === 1.5 || s.speed === 2) ? s.speed : d.speed,
  };
}
