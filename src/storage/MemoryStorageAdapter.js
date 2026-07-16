// MemoryStorageAdapter（Milestone 5-B）: メモリ上の保存アダプター。
// ブラウザ API に依存しないため、SaveCoordinator・バックアップ・競合・移行の自動テストに使う。
// 書き込み失敗のシミュレーション（failWrites）にも対応する。

import { StorageAdapter, summarize } from './StorageAdapter.js';

export class MemoryStorageAdapter extends StorageAdapter {
  // opts: { nowIso?: () => string, available?: boolean }
  constructor(opts = {}) {
    super();
    this.files = new Map();     // type -> envelope
    this.backups = [];          // { id, type, kind, createdAt, size, summary, env }
    this._available = opts.available !== false;
    this._nowIso = opts.nowIso || (() => new Date().toISOString());
    this._seq = 0;
    this.failWrites = false;    // true にすると write が失敗する（フォールバック検証用）
    this.writeLog = [];         // 書き込み順の記録（キュー順序テスト用）
  }

  get id() { return 'memory'; }
  isAvailable() { return this._available; }

  async read(type) {
    const env = this.files.get(type);
    return env ? deepClone(env) : null;
  }

  async write(type, env) {
    if (this.failWrites) return { ok: false, error: 'simulated write failure' };
    this.files.set(type, deepClone(env));
    this.writeLog.push({ type, saveId: env.saveId, updatedAt: env.updatedAt });
    return { ok: true };
  }

  async remove(type) {
    this.files.delete(type);
    return { ok: true };
  }

  async createBackup(type, env, kind = 'auto') {
    const id = `${type}__${this._nowIso().replace(/[^0-9]/g, '')}__${this._seq++}`;
    const str = JSON.stringify(env);
    this.backups.push({ id, type, kind, createdAt: this._nowIso(), size: str.length, summary: summarize(env), env: deepClone(env) });
    return { ok: true, id };
  }

  async listBackups(type = null) {
    return this.backups
      .filter((b) => !type || b.type === type)
      .map(({ env, ...meta }) => meta) // env は返さず、メタのみ
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async restoreBackup(id) {
    const b = this.backups.find((x) => x.id === id);
    return b ? deepClone(b.env) : null;
  }

  async deleteBackup(id) {
    const i = this.backups.findIndex((x) => x.id === id);
    if (i >= 0) { this.backups.splice(i, 1); return { ok: true }; }
    return { ok: false };
  }

  // 自動/手動バックアップの世代上限を適用（古いものから削除）。
  async pruneBackups(limits = {}) {
    const maxAuto = limits.maxAuto ?? 10;
    const maxManual = limits.maxManual ?? 5;
    let removed = 0;
    for (const kind of [['auto', maxAuto], ['manual', maxManual]]) {
      const [k, max] = kind;
      const list = this.backups.filter((b) => b.kind === k).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
      while (list.length > max) {
        const old = list.shift();
        const i = this.backups.indexOf(old);
        if (i >= 0) { this.backups.splice(i, 1); removed++; }
      }
    }
    return { removed };
  }

  async getMetadata() {
    const files = {};
    for (const [type, env] of this.files) files[type] = { saveId: env.saveId, updatedAt: env.updatedAt };
    return { adapter: 'memory', files, backupCount: this.backups.length };
  }

  async testConnection() {
    return { ok: this._available, state: this._available ? 'connected' : 'unavailable' };
  }
}

function deepClone(v) {
  return v == null ? v : JSON.parse(JSON.stringify(v));
}
