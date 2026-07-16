// SaveService（Milestone 5-B）: 保存レイヤーのファサード。UI（DataManagementScene）と
// SaveManager/SaveCoordinator/各アダプターを繋ぐ。ブラウザ専用。
//  - 既定はブラウザ保存（localStorage ミラー）。フォルダは明示接続時のみ使う。
//  - showDirectoryPicker はユーザー操作からのみ呼ぶ。起動時に許可ダイアログは出さない。
//  - どの分岐でもゲームは起動・プレイ・保存できる（フォルダ失敗時はブラウザへフォールバック）。

import { SaveManager } from '../systems/SaveManager.js';
import { SaveCoordinator } from './SaveCoordinator.js';
import { BrowserStorageAdapter } from './BrowserStorageAdapter.js';
import { FolderStorageAdapter } from './FolderStorageAdapter.js';
import { MemoryStorageAdapter } from './MemoryStorageAdapter.js';
import { SAVE_TYPES } from './StorageAdapter.js';
import { extractMeta, detectConflict, recommend } from './SaveConflictResolver.js';
import { loadDirectoryHandle, saveDirectoryHandle, clearDirectoryHandle } from './idb.js';

class SaveServiceClass {
  constructor() {
    this.coordinator = null;
    this.browser = null;
    this.folder = null;
    this.config = {};
    this.saveVersion = 5;
    this.gameVersion = '0.0.0';
    this.folderState = 'disconnected'; // disconnected | connected | needs-permission | denied | unsupported | error
    this.pendingConflict = null;       // { browser, folder, recommendation }
    this._statusCb = null;
    this._lastStatus = {};
  }

  supported() { return FolderStorageAdapter.supported(); }
  onStatus(cb) { this._statusCb = cb; }
  _emit(status) { this._lastStatus = { ...status, folderState: this.folderState, pendingConflict: !!this.pendingConflict }; if (this._statusCb) { try { this._statusCb(this._lastStatus); } catch (e) { /* noop */ } } }
  get status() { return { ...(this.coordinator?.status || {}), folderState: this.folderState, mode: SaveManager.mode, supported: this.supported(), pendingConflict: !!this.pendingConflict }; }

  // 起動時初期化（BootScene から）。ブラウザ保存を用意し、保存済みフォルダハンドルがあれば
  // 権限を確認（ダイアログは出さない）。許可済みならフォルダを主保存先にする。
  async init(saveVersion, gameVersion, config) {
    this.saveVersion = saveVersion; this.gameVersion = gameVersion; this.config = config || {};
    this.browser = new BrowserStorageAdapter();
    if (!this.browser.isAvailable()) this.browser = new MemoryStorageAdapter();
    this.coordinator = new SaveCoordinator({
      primary: this.browser, mirror: null,
      config: this.config,
      meta: { saveVersion, gameVersion, writerId: SaveManager.writerId },
      onStatus: (s) => this._emit(s),
    });
    SaveManager.attachCoordinator(this.coordinator);
    this._seedLineage(this.browser);

    // 複数タブ: 先行タブが居れば読み取り専用として起動（ユーザー操作で引き継ぎ可能）。
    this.coordinator.refreshWriterState();
    if (!this.coordinator.status.readOnly) this.coordinator.claimWriter();

    // 保存済みフォルダハンドルの権限を確認（ダイアログは出さない）。
    try {
      const handle = await loadDirectoryHandle();
      if (handle) {
        this.folder = new FolderStorageAdapter(handle, { ...this._folderConfig() });
        const perm = await this.folder.queryPermission(true);
        if (perm === 'granted') { await this._activateFolder(); await this._checkStartupConflict(); }
        else { this.folderState = 'needs-permission'; this.folder = new FolderStorageAdapter(handle, this._folderConfig()); }
      } else if (!this.supported()) {
        this.folderState = 'unsupported';
      }
    } catch (e) { console.warn('[SaveService] フォルダハンドル復元に失敗', e); this.folderState = 'error'; }
    this._emit(this.coordinator.status);
    return this.status;
  }

  _folderConfig() {
    return { folderName: this.config.folderName || 'ReincarnationFlameSurvivorData', formatVersion: this.config.formatVersion || 1, gameVersion: this.gameVersion, saveVersion: this.saveVersion, writerId: SaveManager.writerId };
  }

  async _seedLineage(adapter) {
    for (const t of SAVE_TYPES) { try { const env = await adapter.read(t); if (env) this.coordinator.seed(t, env); } catch (e) { /* noop */ } }
  }

  async _activateFolder() {
    await this.folder.init();
    this.coordinator.setAdapters(this.folder, this.browser); // folder=primary, browser=mirror
    this.folderState = 'connected';
    SaveManager.setFolderConnected(true);
    this.coordinator.setFolderState('connected');
    await this._seedLineage(this.folder);
  }

  // ユーザー操作から呼ぶ。フォルダを選択して接続する。
  async connectFolder() {
    if (!this.supported()) { this.folderState = 'unsupported'; return { ok: false, reason: 'unsupported' }; }
    let handle;
    try { handle = await window.showDirectoryPicker({ id: 'rfs-save', mode: 'readwrite' }); }
    catch (e) { if (e && e.name === 'AbortError') return { ok: false, reason: 'cancelled' }; console.warn(e); return { ok: false, reason: 'error' }; }
    try {
      this.folder = new FolderStorageAdapter(handle, this._folderConfig());
      const perm = await this.folder.requestPermission(true);
      if (perm !== 'granted') { this.folderState = 'denied'; return { ok: false, reason: 'denied' }; }
      await saveDirectoryHandle(handle);
      await this._activateFolder();
      const conflict = await this._checkStartupConflict();
      // 競合が無く、フォルダが空なら現在のブラウザデータで初期化保存する。
      if (!conflict) await this.saveNow('manual');
      this._emit(this.coordinator.status);
      return { ok: true, conflict: !!conflict };
    } catch (e) { console.warn('[SaveService] connectFolder 失敗', e); this.folderState = 'error'; return { ok: false, reason: 'error' }; }
  }

  // 権限失効後の再接続（ユーザー操作から）。
  async reconnect() {
    try {
      let handle = this.folder?.dirHandle || await loadDirectoryHandle();
      if (!handle) return this.connectFolder();
      if (!this.folder) this.folder = new FolderStorageAdapter(handle, this._folderConfig());
      const perm = await this.folder.requestPermission(true);
      if (perm !== 'granted') { this.folderState = 'denied'; return { ok: false, reason: 'denied' }; }
      await this._activateFolder();
      const conflict = await this._checkStartupConflict();
      this._emit(this.coordinator.status);
      return { ok: true, conflict: !!conflict };
    } catch (e) { console.warn('[SaveService] reconnect 失敗', e); this.folderState = 'error'; return { ok: false, reason: 'error' }; }
  }

  async disconnect() {
    try { await clearDirectoryHandle(); } catch (e) { /* noop */ }
    this.folder = null;
    this.folderState = 'disconnected';
    SaveManager.setFolderConnected(false);
    this.coordinator.setAdapters(this.browser, null);
    this.coordinator.setFolderState('disconnected');
    this._emit(this.coordinator.status);
    return { ok: true };
  }

  // 現在のライブデータ（localStorage）を保存先へ即書き込む。
  async saveNow(reason = 'manual') {
    const prof = SaveManager.rawProfile(); if (prof) this.coordinator.notify('profile', prof, { reason });
    const set = SaveManager.rawSettings(); if (set) this.coordinator.notify('settings', set, { reason });
    const run = SaveManager.rawActiveRun(); if (run && run.inProgress) this.coordinator.notify('activeRun', run, { reason });
    return this.coordinator.flushNow();
  }

  // 起動/接続時の競合検出。両方に profile があり内容が食い違えば pendingConflict を立てる。
  async _checkStartupConflict() {
    try {
      if (!this.folder || !this.folder.isAvailable()) return false;
      const b = await this._sideMeta(this.browser);
      const f = await this._sideMeta(this.folder);
      // manifest と実ファイルの saveId 不一致も競合扱い
      let manifestMismatch = false;
      const manifest = await this.folder.readManifest?.();
      const fEnv = await this.folder.read('profile');
      if (manifest && fEnv && manifest.latestSaveId && manifest.latestSaveId !== fEnv.saveId) manifestMismatch = true;
      const det = detectConflict(b, f);
      if ((det.conflict || manifestMismatch) && b.present && f.present) {
        this.pendingConflict = { browser: b, folder: f, reasons: det.reasons.concat(manifestMismatch ? ['manifest と実ファイルの saveId 不一致'] : []), recommendation: recommend(b, f) };
        return true;
      }
      // フォルダのみにデータがある（新しい端末）→ フォルダを採用
      if (!b.present && f.present) { await this.adoptFolder(); }
      return false;
    } catch (e) { console.warn('[SaveService] 競合検出に失敗', e); return false; }
  }

  async _sideMeta(adapter) {
    try {
      const prof = await adapter.read('profile');
      const run = await adapter.read('activeRun');
      if (!prof) return { present: false };
      return { present: true, env: prof, meta: extractMeta(prof.payload, run && run.payload, prof) };
    } catch (e) { return { present: false }; }
  }

  // 競合解決: 'browser' か 'folder' を採用。採用しない側はバックアップする。
  async resolveConflict(choice) {
    const c = this.pendingConflict; if (!c) return { ok: false };
    try {
      if (choice === 'folder') { await this._backupSide('browser'); await this.adoptFolder(); }
      else { await this._backupSide('folder'); await this.saveNow('conflict'); }
      this.pendingConflict = null;
      this._emit(this.coordinator.status);
      return { ok: true };
    } catch (e) { console.warn('[SaveService] 競合解決に失敗', e); return { ok: false }; }
  }

  async _backupSide(which) {
    const ad = which === 'folder' ? this.folder : this.browser;
    if (!ad) return;
    for (const t of SAVE_TYPES) { const env = await ad.read(t).catch(() => null); if (env) await ad.createBackup?.(t, env, 'conflict').catch(() => {}); }
  }

  // フォルダ内データをライブ（localStorage）へ採用する。
  async adoptFolder() {
    if (!this.folder) return { ok: false };
    const prof = await this.folder.read('profile');
    const set = await this.folder.read('settings');
    const run = await this.folder.read('activeRun');
    SaveManager.applyImported({ profile: prof?.payload, settings: set?.payload, activeRun: run?.payload }, 'conflict');
    this.pendingConflict = null;
    return { ok: true };
  }
  async reloadFromFolder() { return this.adoptFolder(); }
  async reloadFromBrowser() {
    const prof = await this.browser.read('profile');
    if (prof) SaveManager.applyImported({ profile: prof.payload, settings: (await this.browser.read('settings'))?.payload, activeRun: (await this.browser.read('activeRun'))?.payload }, 'conflict');
    return { ok: true };
  }

  // ---- バックアップ ----
  async listBackups(type = null) {
    const ad = this.folder && this.folder.isAvailable() ? this.folder : this.browser;
    try { return await ad.listBackups(type); } catch (e) { return []; }
  }
  async makeManualBackup() {
    let n = 0;
    for (const t of SAVE_TYPES) {
      const env = this.folder && this.folder.isAvailable() ? await this.folder.read(t) : await this.browser.read(t);
      const ad = this.folder && this.folder.isAvailable() ? this.folder : this.browser;
      if (env) { const r = await ad.createBackup(t, env, 'manual'); if (r.ok) n++; }
    }
    const ad = this.folder && this.folder.isAvailable() ? this.folder : this.browser;
    await ad.pruneBackups({ maxAuto: this.config.maxAutoBackups, maxManual: this.config.maxManualBackups });
    return { ok: n > 0, count: n };
  }
  async restoreBackup(id) {
    const ad = this.folder && this.folder.isAvailable() ? this.folder : this.browser;
    await this.makeManualBackup(); // 復元前に現在データをバックアップ
    const env = await ad.restoreBackup(id);
    if (!env) return { ok: false };
    const type = env.type || (id.split('__')[0]) || 'profile';
    if (type === 'profile') SaveManager.applyImported({ profile: env.payload }, 'conflict');
    else if (type === 'settings') SaveManager.applyImported({ settings: env.payload }, 'conflict');
    else if (type === 'activeRun') SaveManager.applyImported({ activeRun: env.payload }, 'conflict');
    return { ok: true, type };
  }
  async deleteBackup(id) {
    const ad = this.folder && this.folder.isAvailable() ? this.folder : this.browser;
    if (typeof ad.deleteBackup === 'function') return ad.deleteBackup(id);
    return { ok: false };
  }

  // 複数タブ: 書き込み権の引き継ぎ（最新を再読込してから）。
  claimWriter() { this.coordinator.claimWriter(); }
  isReadOnly() { return !!this.coordinator?.status.readOnly; }
}

export const SaveService = new SaveServiceClass();
