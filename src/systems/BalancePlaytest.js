// BalancePlaytest（Milestone 6-F）: 「通常プレイ検証モード」の設定・オーバーライド解決を担う純ロジック。
// F5〜F7 のスキル付与やJob Lv変更で強くなりすぎる問題を避け、通常プレイに近い条件でバランスを検証する。
// profile（通貨・進行・Job XP・クリア状態）は一切変更しない — 本モジュールは profile を読むだけで書き換えない。
// Phaser/DOM 非依存で Node からテスト可能。BattleScene（F8 UI）とテストが共有する。

// 検証設定の既定値。
export function defaultPlaytestConfig() {
  return {
    seed: 1,
    difficulty: 1,
    quality: 'high',
    speed: 1,
    jobLevel: null,          // null=通常profile由来 / 数値=一時適用
    activeSlots: null,       // null=通常 / 4|6|8
    choices: null,           // null=通常 / 3|4
    rerolls: null, banishes: null, skips: null, // null=通常
    permUpgrades: 'profile', // 'profile' | 'none' | 'custom'
    soulflame: 'profile',    // 'profile' | 'none'
    mastery: 'profile',      // 'profile' | 'none'
    jobMods: 'normal',       // 'normal' | 'off'
    durationSec: null,       // null=通常5分 / 60 / 600
    customPermUpgrades: {},  // permUpgrades==='custom' のときの指定値
  };
}

// 設定を安全化（既知フィールドのみ・型検証・列挙値クランプ）。
export function coercePlaytestConfig(src) {
  const d = defaultPlaytestConfig();
  const s = (src && typeof src === 'object') ? src : {};
  const oneOf = (v, list, def) => (list.includes(v) ? v : def);
  const numOrNull = (v, allowed) => (typeof v === 'number' && (!allowed || allowed.includes(v)) ? v : null);
  return {
    seed: (typeof s.seed === 'number' && Number.isFinite(s.seed)) ? (s.seed >>> 0) || 1 : 1,
    difficulty: numOrNull(s.difficulty, [1, 2, 3, 4, 5]) || 1,
    quality: oneOf(s.quality, ['low', 'medium', 'high', 'ultra'], 'high'),
    speed: numOrNull(s.speed, [1, 1.5, 2]) || 1,
    jobLevel: (typeof s.jobLevel === 'number' && s.jobLevel >= 1 && s.jobLevel <= 100) ? Math.floor(s.jobLevel) : null,
    activeSlots: numOrNull(s.activeSlots, [4, 6, 8]),
    choices: numOrNull(s.choices, [3, 4]),
    rerolls: (typeof s.rerolls === 'number' && s.rerolls >= 0) ? Math.floor(s.rerolls) : null,
    banishes: (typeof s.banishes === 'number' && s.banishes >= 0) ? Math.floor(s.banishes) : null,
    skips: (typeof s.skips === 'number' && s.skips >= 0) ? Math.floor(s.skips) : null,
    permUpgrades: oneOf(s.permUpgrades, ['profile', 'none', 'custom'], 'profile'),
    soulflame: oneOf(s.soulflame, ['profile', 'none'], 'profile'),
    mastery: oneOf(s.mastery, ['profile', 'none'], 'profile'),
    jobMods: oneOf(s.jobMods, ['normal', 'off'], 'normal'),
    durationSec: numOrNull(s.durationSec, [60, 300, 600]),
    customPermUpgrades: (s.customPermUpgrades && typeof s.customPermUpgrades === 'object' && !Array.isArray(s.customPermUpgrades)) ? s.customPermUpgrades : {},
  };
}

// Balance Playtest の周回は常にデバッグ周回（通常バランス統計へ混ぜない）。
// 一時デバッグ補正（F5〜F7）を使った通常周回も debugRun 扱いにするため、呼び出し側は usedDebugTuner も併用する。
export function isDebugRun(config, usedDebugTuner) {
  if (usedDebugTuner) return true;
  return true; // Balance Playtest 自体が検証モード＝常に debugRun
}

// profile を変更せずに、この検証周回で「適用する」オーバーライドを解決する（読み取り専用）。
// 戻り値は BattleScene が一時的に使う純データ。profile への書き込みは一切しない。
export function resolveOverrides(config, profile) {
  const c = coercePlaytestConfig(config);
  const p = (profile && typeof profile === 'object') ? profile : {};
  const permUpgrades = c.permUpgrades === 'none' ? {}
    : c.permUpgrades === 'custom' ? { ...c.customPermUpgrades }
    : { ...(p.permanentUpgrades || {}) };
  return {
    seed: c.seed, difficulty: c.difficulty, quality: c.quality, speed: c.speed,
    jobLevel: c.jobLevel, activeSlots: c.activeSlots, choices: c.choices,
    rerolls: c.rerolls, banishes: c.banishes, skips: c.skips,
    // 恒久強化: none=無効 / custom=指定 / profile=通常（profile のコピー・元は不変）。
    permUpgrades,
    disableSoulflame: c.soulflame === 'none',
    disableMastery: c.mastery === 'none',
    disableJobMods: c.jobMods === 'off',
    durationSec: c.durationSec,
    // profile 側の通貨/進行/JobXP/クリアは絶対に変更しない、を明示するフラグ。
    readOnlyProfile: true,
    debugRun: true,
  };
}

// Balance Playtest の周回では profile のどのフィールドも書き換えてはならない（保護対象の宣言）。
export const PROTECTED_PROFILE_FIELDS = [
  'embers', 'lifetimeEmbers', 'soulflame', 'lifetimeSoulflame', 'permanentUpgrades',
  'reincarnationUpgrades', 'reincarnationCount', 'jobProgress', 'skillMastery', 'passiveMastery',
  'unlockedDifficulties', 'highestClearedDifficulty', 'highestEverDifficulty', 'statistics',
];
