// FolderStorageAdapter（Milestone 5-B）: File System Access API を使い、ユーザーが選択した
// フォルダ内の ReincarnationFlameSurvivorData/ へ JSON を保存する。ブラウザ専用（Node 非対応）。
//
// 安全な書き込み（可能な範囲）:
//   1. 一時ファイル(*.tmp.json)へ書く → 2. 読み直して検証 → 3. 本ファイルへ書く →
//   4. 読み直して検証 → 5. manifest を最後に更新 → 6. 一時ファイルを削除。
// ※ ブラウザ API に原子的 rename は無いため「一時→本ファイルの原子的差し替え」はできない。
//    バックアップ＋書き込み後検証で破損リスクを下げる（詳細は docs/save-format.md）。
//
// ユーザーが選んだフォルダ以外へは一切書き込まない。作成/更新するのは専用サブフォルダ内のみ。

import { StorageAdapter, summarize, FILE_NAMES } from './StorageAdapter.js';
import { verifyEnvelope } from './SaveValidator.js';

const BACKUPS_DIR = 'backups';

export class FolderStorageAdapter extends StorageAdapter {
  // dirHandle: FileSystemDirectoryHandle（ユーザーが選択したフォルダ）
  // config: { folderName, formatVersion, gameVersion, saveVersion, writerId }
  constructor(dirHandle, config = {}) {
    super();
    this.dirHandle = dirHandle;
    this.config = config;
    this.root = null;       // 専用サブフォルダ（ReincarnationFlameSurvivorData/）
    this.backupsDir = null;
    this._ready = false;
  }

  get id() { return 'folder'; }
  isAvailable() { return !!this.dirHandle && this._ready; }

  static supported() {
    return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
  }

  // 権限確認。'granted' | 'prompt' | 'denied'。
  async queryPermission(readWrite = true) {
    try {
      if (!this.dirHandle || !this.dirHandle.queryPermission) return 'prompt';
      return await this.dirHandle.queryPermission({ mode: readWrite ? 'readwrite' : 'read' });
    } catch (e) { return 'denied'; }
  }

  // ユーザー操作からのみ呼ぶ（許可ダイアログを出す可能性がある）。
  async requestPermission(readWrite = true) {
    try {
      if (!this.dirHandle || !this.dirHandle.requestPermission) return 'denied';
      return await this.dirHandle.requestPermission({ mode: readWrite ? 'readwrite' : 'read' });
    } catch (e) { return 'denied'; }
  }

  // 専用サブフォルダとバックアップフォルダを用意（既存があれば再利用）。
  async init() {
    const name = this.config.folderName || 'ReincarnationFlameSurvivorData';
    this.root = await this.dirHandle.getDirectoryHandle(name, { create: true });
    this.backupsDir = await this.root.getDirectoryHandle(BACKUPS_DIR, { create: true });
    this._ready = true;
    return true;
  }

  async _writeFile(dir, fileName, text) {
    const fh = await dir.getFileHandle(fileName, { create: true });
    const w = await fh.createWritable();
    await w.write(text);
    await w.close();
  }

  async _readFile(dir, fileName) {
    try {
      const fh = await dir.getFileHandle(fileName, { create: false });
      const file = await fh.getFile();
      const text = await file.text();
      return { text, size: file.size };
    } catch (e) { return null; }
  }

  async _deleteFile(dir, fileName) {
    try { await dir.removeEntry(fileName); } catch (e) { /* 存在しない等は無視 */ }
  }

  async read(type) {
    const r = await this._readFile(this.root, FILE_NAMES[type]);
    if (!r) return null;
    try { return JSON.parse(r.text); } catch (e) { return null; }
  }

  // 安全書き込み: tmp へ書く→検証→本ファイルへ書く→検証→（呼び出し側で）manifest 更新。
  async write(type, env) {
    if (!this._ready) return { ok: false, error: 'folder-not-ready' };
    const fileName = FILE_NAMES[type];
    const tmpName = fileName.replace(/\.json$/, '.tmp.json');
    const text = JSON.stringify(env, null, 2);
    try {
      // 1-2. 一時ファイルへ書いて読み直し検証
      await this._writeFile(this.root, tmpName, text);
      const tmp = await this._readFile(this.root, tmpName);
      if (!tmp || tmp.text !== text) return { ok: false, error: 'tmp-verify-failed' };
      // 3-4. 本ファイルへ書いて読み直し検証
      await this._writeFile(this.root, fileName, text);
      const main = await this._readFile(this.root, fileName);
      if (!main) return { ok: false, error: 'main-read-failed' };
      let parsed;
      try { parsed = JSON.parse(main.text); } catch (e) { return { ok: false, error: 'main-parse-failed' }; }
      const v = verifyEnvelope(parsed);
      if (!v.ok) return { ok: false, error: 'main-verify-' + v.reason };
      // 6. 一時ファイルを削除（できなくても致命的ではない）
      await this._deleteFile(this.root, tmpName);
      return { ok: true, size: main.size };
    } catch (e) {
      console.warn('[FolderStorageAdapter] 書き込み失敗', type, e);
      return { ok: false, error: String((e && e.name) || e) };
    }
  }

  async remove(type) { await this._deleteFile(this.root, FILE_NAMES[type]); return { ok: true }; }

  // manifest を最後に書く（本ファイル群の整合を示す）。
  async writeManifest(manifest) {
    try {
      const text = JSON.stringify(manifest, null, 2);
      await this._writeFile(this.root, 'manifest.tmp.json', text);
      await this._writeFile(this.root, 'manifest.json', text);
      await this._deleteFile(this.root, 'manifest.tmp.json');
      return { ok: true };
    } catch (e) { return { ok: false, error: String((e && e.name) || e) }; }
  }

  async readManifest() {
    const r = await this._readFile(this.root, 'manifest.json');
    if (!r) return null;
    try { return JSON.parse(r.text); } catch (e) { return null; }
  }

  _backupFileName(type, kind) {
    const ts = new Date().toISOString().replace(/[-:T]/g, '').replace(/\..+/, '');
    const k = kind && kind !== 'auto' ? `_${kind}` : '';
    return `${type}_${ts}${k}.json`;
  }

  async createBackup(type, env, kind = 'auto') {
    if (!this._ready) return { ok: false, error: 'folder-not-ready' };
    const fileName = this._backupFileName(type, kind);
    try {
      await this._writeFile(this.backupsDir, fileName, JSON.stringify(env, null, 2));
      return { ok: true, id: fileName };
    } catch (e) { return { ok: false, error: String((e && e.name) || e) }; }
  }

  async listBackups(type = null) {
    const out = [];
    if (!this.backupsDir) return out;
    try {
      for await (const [name, handle] of this.backupsDir.entries()) {
        if (handle.kind !== 'file' || !name.endsWith('.json')) continue;
        const t = name.split('_')[0];
        if (type && t !== type) continue;
        const kind = /_(manual|migration|conflict|import)\.json$/.test(name) ? RegExp.$1 : 'auto';
        let summary = null, size = 0, createdAt = null, saveId = null;
        try {
          const file = await handle.getFile();
          size = file.size;
          const env = JSON.parse(await file.text());
          summary = summarize(env);
          createdAt = env.updatedAt || null;
          saveId = env.saveId || null;
        } catch (e) { /* 壊れたファイルはメタのみ */ }
        out.push({ id: name, type: t, kind, createdAt, size, saveId, summary });
      }
    } catch (e) { console.warn('[FolderStorageAdapter] バックアップ一覧の取得に失敗', e); }
    return out.sort((a, b) => (String(a.id) < String(b.id) ? 1 : -1));
  }

  async restoreBackup(id) {
    const r = await this._readFile(this.backupsDir, id);
    if (!r) return null;
    try { return JSON.parse(r.text); } catch (e) { return null; }
  }

  async deleteBackup(id) { await this._deleteFile(this.backupsDir, id); return { ok: true }; }

  async pruneBackups(limits = {}) {
    const maxAuto = limits.maxAuto ?? 10;
    const maxManual = limits.maxManual ?? 5;
    let removed = 0;
    const all = await this.listBackups();
    // type × kind ごとに世代管理する。
    const groups = {};
    for (const b of all) { const g = `${b.type}:${b.kind}`; (groups[g] = groups[g] || []).push(b); }
    for (const g of Object.keys(groups)) {
      const kind = g.split(':')[1];
      const max = kind === 'manual' ? maxManual : (kind === 'auto' ? maxAuto : Infinity);
      const list = groups[g].sort((a, b) => (String(a.id) < String(b.id) ? -1 : 1)); // 古い順
      while (list.length > max) { const old = list.shift(); await this.deleteBackup(old.id); removed++; }
    }
    return { removed };
  }

  async getMetadata() {
    const manifest = await this.readManifest();
    const files = {};
    for (const type of Object.keys(FILE_NAMES)) {
      const env = await this.read(type);
      if (env) files[type] = { saveId: env.saveId, updatedAt: env.updatedAt };
    }
    return { adapter: 'folder', manifest, files };
  }

  async testConnection() {
    if (!this.dirHandle) return { ok: false, state: 'unavailable' };
    const perm = await this.queryPermission(true);
    if (perm === 'granted') return { ok: this._ready, state: this._ready ? 'connected' : 'needs-init' };
    if (perm === 'prompt') return { ok: false, state: 'needs-permission' };
    return { ok: false, state: 'denied' };
  }
}
