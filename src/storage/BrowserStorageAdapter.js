// BrowserStorageAdapter（Milestone 5-B）: localStorage を保存先とするアダプター。
// フォルダ未接続時の主保存先、フォルダ接続時のミラー先として使う。
// エンベロープ（checksum 付き）を専用キーへ保存し、既存の生 profile/active_run/settings キーとは
// 分離する（生キーは SaveManager の同期ライブキャッシュとして維持し、後方互換を壊さない）。

import { StorageAdapter, summarize } from './StorageAdapter.js';

const ENV_KEY = { profile: 'rfs_env_profile', activeRun: 'rfs_env_active_run', settings: 'rfs_env_settings' };
const BACKUP_INDEX = 'rfs_backup_index';
const BACKUP_PREFIX = 'rfs_backup_';

export class BrowserStorageAdapter extends StorageAdapter {
  constructor() {
    super();
    this._available = this._check();
  }

  get id() { return 'browser'; }
  isAvailable() { return this._available; }

  _check() {
    try { localStorage.setItem('__rfs_test__', '1'); localStorage.removeItem('__rfs_test__'); return true; }
    catch (e) { return false; }
  }

  _get(key) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; }
    catch (e) { console.warn('[BrowserStorageAdapter] 読み込み失敗', key, e); return null; }
  }
  _set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return { ok: true }; }
    catch (e) { console.warn('[BrowserStorageAdapter] 書き込み失敗', key, e); return { ok: false, error: String(e && e.name || e) }; }
  }

  async read(type) { return this._get(ENV_KEY[type]) || null; }
  async write(type, env) { return this._set(ENV_KEY[type], env); }
  async remove(type) { try { localStorage.removeItem(ENV_KEY[type]); } catch (e) { /* noop */ } return { ok: true }; }

  _index() { return this._get(BACKUP_INDEX) || []; }
  _saveIndex(idx) { return this._set(BACKUP_INDEX, idx); }

  async createBackup(type, env, kind = 'auto') {
    const id = `${type}__${new Date().toISOString().replace(/[^0-9]/g, '')}__${Math.floor(Math.random() * 1e6)}`;
    const str = JSON.stringify(env);
    const res = this._set(BACKUP_PREFIX + id, env);
    if (!res.ok) return { ok: false, error: res.error };
    const idx = this._index();
    idx.push({ id, type, kind, createdAt: new Date().toISOString(), size: str.length, summary: summarize(env) });
    this._saveIndex(idx);
    return { ok: true, id };
  }

  async listBackups(type = null) {
    return this._index()
      .filter((b) => !type || b.type === type)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async restoreBackup(id) { return this._get(BACKUP_PREFIX + id) || null; }

  async deleteBackup(id) {
    try { localStorage.removeItem(BACKUP_PREFIX + id); } catch (e) { /* noop */ }
    const idx = this._index().filter((b) => b.id !== id);
    this._saveIndex(idx);
    return { ok: true };
  }

  async pruneBackups(limits = {}) {
    const maxAuto = limits.maxAuto ?? 10;
    const maxManual = limits.maxManual ?? 5;
    let removed = 0;
    let idx = this._index();
    for (const [k, max] of [['auto', maxAuto], ['manual', maxManual]]) {
      const list = idx.filter((b) => b.kind === k).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
      while (list.length > max) {
        const old = list.shift();
        try { localStorage.removeItem(BACKUP_PREFIX + old.id); } catch (e) { /* noop */ }
        idx = idx.filter((b) => b.id !== old.id);
        removed++;
      }
    }
    this._saveIndex(idx);
    return { removed };
  }

  async getMetadata() {
    const files = {};
    for (const type of Object.keys(ENV_KEY)) {
      const env = this._get(ENV_KEY[type]);
      if (env) files[type] = { saveId: env.saveId, updatedAt: env.updatedAt };
    }
    return { adapter: 'browser', files, backupCount: this._index().length };
  }

  async testConnection() { return { ok: this._available, state: this._available ? 'connected' : 'unavailable' }; }
}
