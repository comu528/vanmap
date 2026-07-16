// セーブ管理（Milestone 5-B）。
// localStorage を「同期のライブキャッシュ（唯一の即時読み書き先）」として維持しつつ、
// SaveCoordinator を通じてフォルダ保存/ミラー/バックアップ/manifest へ非同期でミラーする。
// これにより既存の同期呼び出し（ProgressionManager 等）を変えずにフォルダ保存を追加できる。
//
// save_version 移行:
//  - profile は旧版（v1〜v4）を profileSchema.migrateProfile で最新(v5)へ移行する。
//    移行前に旧データを別キー（rfs_profile_backup_v{old}_{時刻}）へ退避し、即時削除はしない。
//  - active_run は v2 以降スキーマ互換のため save_version>=2 を許容。cycleNumber 不一致は破棄。

import {
  defaultProfile, migrateProfile, fillProfileDefaults, defaultSettings, coerceSettings, num, obj,
} from './profileSchema.js';
import { newId } from '../storage/SaveValidator.js';

const KEY_PROFILE = 'rfs_profile';
const KEY_ACTIVE_RUN = 'rfs_active_run';
const KEY_SETTINGS = 'rfs_settings';
const KEY_WRITER = 'rfs_writer_id';
const KEY_MIGRATIONS = 'rfs_migrations';

class SaveManagerClass {
  constructor() {
    this.folderConnected = false;
    this._available = this._checkStorage();
    this._saveVersion = 1;
    this._gameVersion = '0.0.0';
    this._coordinator = null;
    this.writerId = this._ensureWriterId();
    this._migratedThisSession = false;
  }

  get mode() { return this.folderConnected ? 'folder' : (this._available ? 'localStorage' : 'memory'); }

  init(saveVersion, gameVersion) {
    this._saveVersion = saveVersion || 1;
    this._gameVersion = gameVersion || '0.0.0';
  }

  // SaveCoordinator を後付けする（未接続でもゲームは localStorage で完全動作する）。
  attachCoordinator(coordinator) { this._coordinator = coordinator; }
  setFolderConnected(v) { this.folderConnected = !!v; }

  _checkStorage() {
    try { const t = '__rfs_test__'; localStorage.setItem(t, '1'); localStorage.removeItem(t); return true; }
    catch (e) { return false; }
  }
  get available() { return this._available; }

  _ensureWriterId() {
    try {
      let id = (typeof sessionStorage !== 'undefined') ? sessionStorage.getItem(KEY_WRITER) : null;
      if (!id) { id = newId('writer'); if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(KEY_WRITER, id); }
      return id;
    } catch (e) { return newId('writer'); }
  }

  _read(key, fallback) {
    if (!this._available) return fallback;
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch (e) { console.warn(`[SaveManager] ${key} の読み込みに失敗:`, e); return fallback; }
  }
  _write(key, value) {
    if (!this._available) return false;
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { console.warn(`[SaveManager] ${key} の書き込みに失敗:`, e); return false; }
  }

  // 旧データを別キーへ退避し、移行記録を残す（即時削除しない＝将来の掃除用）。
  _backupLegacyKeys(oldVersion) {
    if (!this._available) return;
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    try {
      const prof = localStorage.getItem(KEY_PROFILE);
      if (prof) localStorage.setItem(`rfs_profile_backup_v${oldVersion}_${ts}`, prof);
      const run = localStorage.getItem(KEY_ACTIVE_RUN);
      if (run) localStorage.setItem(`rfs_active_run_backup_v${oldVersion}_${ts}`, run);
      const migs = this._read(KEY_MIGRATIONS, []) || [];
      migs.push({ from: oldVersion, to: this._saveVersion, at: ts });
      this._write(KEY_MIGRATIONS, migs);
    } catch (e) { console.warn('[SaveManager] 旧データの退避に失敗:', e); }
  }

  loadProfile(saveVersion, gameVersion) {
    const sv = saveVersion || this._saveVersion;
    const gv = gameVersion || this._gameVersion;
    const p = this._read(KEY_PROFILE, null);
    if (p && typeof p.save_version === 'number') {
      if (p.save_version !== sv) {
        this._backupLegacyKeys(p.save_version);       // 移行前に退避
        const migrated = migrateProfile(p, sv, gv);
        this._write(KEY_PROFILE, migrated);
        this._migratedThisSession = true;
        this._notify('profile', migrated, 'migration');
        return migrated;
      }
      return fillProfileDefaults(p, sv, gv);
    }
    const fresh = defaultProfile(sv, gv);
    this._write(KEY_PROFILE, fresh);
    return fresh;
  }

  saveProfile(profile, reason = 'auto') {
    profile.updated_at = new Date().toISOString();
    const ok = this._write(KEY_PROFILE, profile);
    this._notify('profile', profile, reason);
    return ok;
  }

  loadSettings() { return coerceSettings(this._read(KEY_SETTINGS, {}) || {}); }
  saveSettings(settings, reason = 'settings') {
    const ok = this._write(KEY_SETTINGS, settings);
    this._notify('settings', settings, reason);
    return ok;
  }

  hasActiveRun() { return !!this.loadActiveRun(); }

  loadActiveRun() {
    const r = this._read(KEY_ACTIVE_RUN, null);
    if (!r || !r.inProgress) return null;
    if (typeof r.save_version === 'number' && r.save_version < 2) { this.clearActiveRun(); return null; }
    if (typeof r.elapsedSec !== 'number' || typeof r.difficulty !== 'number') { this.clearActiveRun(); return null; }
    const prof = this._read(KEY_PROFILE, null);
    const curCycle = num(prof?.reincarnationCount, 0);
    if (num(r.cycleNumber, 0) !== curCycle) { this.clearActiveRun(); return null; }
    return r;
  }

  saveActiveRun(run, reason = 'auto') {
    const ok = this._write(KEY_ACTIVE_RUN, run);
    this._notify('activeRun', run, reason);
    return ok;
  }

  clearActiveRun() {
    if (this._available) { try { localStorage.removeItem(KEY_ACTIVE_RUN); } catch (e) { /* noop */ } }
    if (this._coordinator) { try { this._coordinator.removeNow('activeRun'); } catch (e) { /* noop */ } }
  }

  // ---- 一式のエクスポート/差し替え（データ管理画面が使用） ----
  rawProfile() { return this._read(KEY_PROFILE, null); }
  rawActiveRun() { return this._read(KEY_ACTIVE_RUN, null); }
  rawSettings() { return this._read(KEY_SETTINGS, null); }

  exportBundle() {
    return {
      exportFormatVersion: 1,
      exportedAt: new Date().toISOString(),
      gameVersion: this._gameVersion,
      saveVersion: this._saveVersion,
      profile: this.rawProfile(),
      activeRun: this.rawActiveRun(),
      settings: this.rawSettings() || defaultSettings(),
      manifest: { formatVersion: 1, writerId: this.writerId, saveVersion: this._saveVersion, gameVersion: this._gameVersion },
    };
  }

  // 検証済みバンドル/データを localStorage のライブキャッシュへ差し替える（移行処理を必ず通す）。
  // profile は migrateProfile を通して既定スキーマへマッピングする（未知キーは採用しない）。
  applyImported({ profile, settings, activeRun }, reason = 'import') {
    if (profile) {
      const migrated = migrateProfile(profile, this._saveVersion, this._gameVersion);
      this._write(KEY_PROFILE, migrated);
      if (this._coordinator) this._coordinator.resetLineage('profile');
      this._notify('profile', migrated, reason);
    }
    if (settings) {
      const s = coerceSettings(settings);
      this._write(KEY_SETTINGS, s);
      if (this._coordinator) this._coordinator.resetLineage('settings');
      this._notify('settings', s, reason);
    }
    // active_run は現在の周回と一致する場合のみ採用（cycleNumber）。
    const prof = this._read(KEY_PROFILE, null);
    if (activeRun && activeRun.inProgress && num(activeRun.cycleNumber, 0) === num(prof?.reincarnationCount, 0)
      && typeof activeRun.elapsedSec === 'number' && typeof activeRun.difficulty === 'number') {
      this._write(KEY_ACTIVE_RUN, activeRun);
      if (this._coordinator) this._coordinator.resetLineage('activeRun');
      this._notify('activeRun', activeRun, reason);
    } else {
      this.clearActiveRun();
    }
    return this.loadProfile();
  }

  // ブラウザ内のセーブデータを初期化する（バックアップキーは残す）。
  resetLocal() {
    if (!this._available) return;
    for (const k of [KEY_PROFILE, KEY_ACTIVE_RUN, KEY_SETTINGS]) { try { localStorage.removeItem(k); } catch (e) { /* noop */ } }
    if (this._coordinator) this._coordinator.resetAllLineage();
  }

  _notify(type, payload, reason) {
    if (!this._coordinator) return;
    try { this._coordinator.notify(type, payload, { reason }); } catch (e) { console.warn('[SaveManager] coordinator notify 失敗:', e); }
  }

  get statusText() {
    if (!this._available) return 'ブラウザ保存: 利用不可（メモリのみ）';
    return this.folderConnected ? 'フォルダ保存: 接続済み' : 'ブラウザ保存: 有効';
  }
}

export const SaveManager = new SaveManagerClass();
