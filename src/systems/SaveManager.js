// セーブ管理（Milestone 3 版）。
// ブラウザ内 localStorage を扱う軽量実装。profile に恒久成長（残り火・恒久強化・難易度解放・
// スキル熟練度・統計）を保存する。active_run（途中セーブ）は M2 から継続。
// フォルダ保存 / IndexedDB / バックアップ / 競合解決は Milestone 5 で
// FolderSaveManager と統合して拡張する（TODO.md 参照）。
//
// save_version 移行方針:
//  - profile: 旧版（v1/v2）は明示的にフィールドをマッピングして v3 スキーマへ移行する
//    （不足フィールドは安全な初期値。起動不能を避ける）。
//  - active_run: 実行データのスキーマは v2 と v3 で互換のため、save_version>=2 を許容して
//    途中再開を維持する。破損・必須欠落・過古版は破棄して「新規のみ可」に安全フォールバック。

const KEY_PROFILE = 'rfs_profile';
const KEY_ACTIVE_RUN = 'rfs_active_run';
const KEY_SETTINGS = 'rfs_settings';

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const arr = (v) => (Array.isArray(v) ? v : null);

function defaultProfile(saveVersion, gameVersion) {
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
  };
}

// 旧版 profile（v1/v2/v3）を v4 スキーマへ明示マッピングで移行する（stale キーは持ち越さない）。
function migrateProfile(stored, sv, gv) {
  const m = defaultProfile(sv, gv);
  m.created_at = stored.created_at || m.created_at;
  m.embers = num(stored.embers, num(stored.currencies?.ember, 0));
  m.lifetimeEmbers = num(stored.lifetimeEmbers, m.embers);
  m.permanentUpgrades = obj(stored.permanentUpgrades);
  m.unlockedDifficulties = arr(stored.unlockedDifficulties) || arr(stored.difficultyUnlocked) || [1];
  if (!m.unlockedDifficulties.includes(1)) m.unlockedDifficulties.unshift(1);
  m.selectedDifficulty = num(stored.selectedDifficulty, 1);
  m.highestClearedDifficulty = num(stored.highestClearedDifficulty, 0);
  m.skillMastery = obj(stored.skillMastery);
  const os = obj(stored.statistics);
  const legacy = obj(stored.stats);
  m.statistics = {
    totalPlayTime: num(os.totalPlayTime, 0),
    totalRuns: num(os.totalRuns, num(legacy.runs, 0)),
    totalWins: num(os.totalWins, 0),
    totalDefeats: num(os.totalDefeats, 0),
    totalKills: num(os.totalKills, num(legacy.kills, 0)),
    totalBossKills: num(os.totalBossKills, num(legacy.bossKills, 0)),
    highestDamage: num(os.highestDamage, 0),
  };
  m.lastResultId = stored.lastResultId ?? null;
  // v4 の転生系（v3 以前は既定 0 / 空）。currencies.soulflame（v3前方互換）も拾う。
  m.reincarnationCount = num(stored.reincarnationCount, 0);
  m.soulflame = num(stored.soulflame, num(stored.currencies?.soulflame, 0));
  m.lifetimeSoulflame = num(stored.lifetimeSoulflame, m.soulflame);
  m.reincarnationUpgrades = obj(stored.reincarnationUpgrades);
  m.highestEverDifficulty = num(stored.highestEverDifficulty, m.highestClearedDifficulty);
  m.lastReincarnationId = stored.lastReincarnationId ?? null;
  m.reincarnationHistory = arr(stored.reincarnationHistory) || [];
  m.unlockedFeatures = obj(stored.unlockedFeatures);
  m.evolutionStatistics = obj(stored.evolutionStatistics);
  const cc = obj(stored.currentCycle);
  m.currentCycle = {
    cycleNumber: num(cc.cycleNumber, m.reincarnationCount),
    cycleEmbers: num(cc.cycleEmbers, 0),
    cycleHighestDifficulty: num(cc.cycleHighestDifficulty, 0),
    cycleBossKills: num(cc.cycleBossKills, 0),
    cycleStartTime: cc.cycleStartTime || m.created_at,
  };
  m.achievements = arr(stored.achievements) || [];
  return m;
}

function defaultSettings() {
  return {
    effectQuality: 'high',
    damageNumbers: true,
    screenShake: true,
    whiteFlash: true,
    autoMove: false,
    speed: 1,
  };
}

class SaveManagerClass {
  constructor() {
    this.mode = 'localStorage'; // 'folder' は M5 で追加
    this.folderConnected = false;
    this._available = this._checkStorage();
    this._saveVersion = 1;
    this._gameVersion = '0.0.0';
  }

  // BootScene から balance の版数を注入する。
  init(saveVersion, gameVersion) {
    this._saveVersion = saveVersion || 1;
    this._gameVersion = gameVersion || '0.0.0';
  }

  _checkStorage() {
    try {
      const t = '__rfs_test__';
      localStorage.setItem(t, '1');
      localStorage.removeItem(t);
      return true;
    } catch (e) {
      return false;
    }
  }

  get available() { return this._available; }

  _read(key, fallback) {
    if (!this._available) return fallback;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      console.warn(`[SaveManager] ${key} の読み込みに失敗:`, e);
      return fallback;
    }
  }

  _write(key, value) {
    if (!this._available) return false;
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn(`[SaveManager] ${key} の書き込みに失敗:`, e);
      return false;
    }
  }

  loadProfile(saveVersion, gameVersion) {
    const sv = saveVersion || this._saveVersion;
    const gv = gameVersion || this._gameVersion;
    const p = this._read(KEY_PROFILE, null);
    if (p && typeof p.save_version === 'number') {
      if (p.save_version !== sv) {
        // 版差は明示マッピングで移行して保存する。
        const migrated = migrateProfile(p, sv, gv);
        this._write(KEY_PROFILE, migrated);
        return migrated;
      }
      // 同版でも欠落フィールドを安全に補完（部分破損対策）。
      const d = defaultProfile(sv, gv);
      return {
        ...d, ...p,
        statistics: { ...d.statistics, ...obj(p.statistics) },
        currentCycle: { ...d.currentCycle, ...obj(p.currentCycle) },
      };
    }
    const fresh = defaultProfile(sv, gv);
    this._write(KEY_PROFILE, fresh);
    return fresh;
  }

  saveProfile(profile) {
    profile.updated_at = new Date().toISOString();
    return this._write(KEY_PROFILE, profile);
  }

  loadSettings() {
    return { ...defaultSettings(), ...(this._read(KEY_SETTINGS, {}) || {}) };
  }

  saveSettings(settings) {
    return this._write(KEY_SETTINGS, settings);
  }

  // 途中セーブ関連。版不一致 / 破損 / 必須欠落は「途中セーブなし」として安全に扱う。
  hasActiveRun() {
    return !!this.loadActiveRun();
  }

  loadActiveRun() {
    const r = this._read(KEY_ACTIVE_RUN, null);
    if (!r || !r.inProgress) return null;
    // 実行データは v2 以降でスキーマ互換のため、過古版のみ破棄する。
    if (typeof r.save_version === 'number' && r.save_version < 2) { this.clearActiveRun(); return null; }
    if (typeof r.elapsedSec !== 'number' || typeof r.difficulty !== 'number') { this.clearActiveRun(); return null; }
    // 転生をまたいだ古い active_run を再開させない（cycleNumber 不一致は破棄）。
    const prof = this._read(KEY_PROFILE, null);
    const curCycle = num(prof?.reincarnationCount, 0);
    if (num(r.cycleNumber, 0) !== curCycle) { this.clearActiveRun(); return null; }
    return r;
  }

  saveActiveRun(run) {
    return this._write(KEY_ACTIVE_RUN, run);
  }

  clearActiveRun() {
    if (!this._available) return;
    try { localStorage.removeItem(KEY_ACTIVE_RUN); } catch (e) { /* noop */ }
  }

  get statusText() {
    if (!this._available) return 'ブラウザ保存: 利用不可';
    return this.folderConnected ? 'フォルダ保存: 接続済み' : 'ブラウザ保存: 有効';
  }
}

export const SaveManager = new SaveManagerClass();
