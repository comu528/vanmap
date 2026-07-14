// セーブ管理（Milestone 1 版）。
// M1 ではブラウザ内 localStorage のみを扱う軽量実装。
// フォルダ保存 / IndexedDB / バックアップ / 競合解決は Milestone 5 で
// FolderSaveManager と統合して拡張する（TODO.md 参照）。

const KEY_PROFILE = 'rfs_profile';
const KEY_ACTIVE_RUN = 'rfs_active_run';
const KEY_SETTINGS = 'rfs_settings';

function defaultProfile(saveVersion, gameVersion) {
  return {
    save_version: saveVersion || 1,
    game_version: gameVersion || '0.0.0',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    currencies: { ember: 0, soulflame: 0 },
    permanentUpgrades: {},
    difficultyUnlocked: [1],
    reincarnationCount: 0,
    reincarnationNodes: [],
    skillMastery: {},
    stats: { runs: 0, kills: 0, bossKills: 0, bestTime: 0 },
    achievements: [],
  };
}

function defaultSettings() {
  return {
    effectQuality: 'high',
    damageNumbers: true,
    screenShake: true,
    whiteFlash: true,
    autoMove: false,
  };
}

class SaveManagerClass {
  constructor() {
    this.mode = 'localStorage'; // 'folder' は M5 で追加
    this.folderConnected = false;
    this._available = this._checkStorage();
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
    const p = this._read(KEY_PROFILE, null);
    if (p && typeof p.save_version === 'number') return p;
    const fresh = defaultProfile(saveVersion, gameVersion);
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

  // 途中セーブ関連（M2 の「途中再開」で本格利用）。
  hasActiveRun() {
    const r = this._read(KEY_ACTIVE_RUN, null);
    return !!(r && r.inProgress);
  }

  loadActiveRun() {
    return this._read(KEY_ACTIVE_RUN, null);
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
