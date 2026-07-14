// セーブ管理（Milestone 2 版）。
// ブラウザ内 localStorage を扱う軽量実装。M2 で active_run（途中セーブ）を本格利用する。
// フォルダ保存 / IndexedDB / バックアップ / 競合解決は Milestone 5 で
// FolderSaveManager と統合して拡張する（TODO.md 参照）。
//
// save_version 移行方針: profile は追加専用スキーマのため、旧版データは不足フィールドを
// 既定値でマージして版数を更新する（起動不能を避ける）。active_run は版不一致なら破棄して
// 「新規のみ可」に安全にフォールバックする（途中再開しないだけで壊れない）。

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
      // 追加スキーマの移行: 不足フィールドを既定値で補い、版数を更新する。
      if (p.save_version !== sv) {
        const merged = { ...defaultProfile(sv, gv), ...p, save_version: sv, game_version: gv };
        this._write(KEY_PROFILE, merged);
        return merged;
      }
      return p;
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
    if (r.save_version !== this._saveVersion) { this.clearActiveRun(); return null; }
    if (typeof r.elapsedSec !== 'number' || typeof r.difficulty !== 'number') { this.clearActiveRun(); return null; }
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
