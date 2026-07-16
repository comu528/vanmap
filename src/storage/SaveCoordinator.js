// SaveCoordinator（Milestone 5-B）: 保存要求を一元管理する。
//  - フォルダ接続中: フォルダ(primary)へ保存し、ブラウザ(mirror)へもミラー保存。
//  - フォルダ未接続: ブラウザ(primary)へ保存（手動 JSON は UI 側）。
//  - デバウンス＋キューで同時書き込みを防ぎ、最新状態を最後に保存する。
//  - バックアップ方針（重要変更・最小間隔）、manifest 更新、複数タブ制御を担う。
//
// DOM 依存（BroadcastChannel / localStorage のロック / setTimeout）は存在確認で保護し、
// 依存注入により Node からもキュー順序・フォールバック・バックアップ世代をテストできる。

import { makeEnvelope, newId } from './SaveValidator.js';
import { SAVE_TYPES } from './StorageAdapter.js';

// 重要変更（毎回バックアップ）を伴う保存理由。
const IMPORTANT_REASONS = new Set([
  'reincarnate', 'soulflame_buy', 'migration', 'import', 'conflict', 'manual', 'reset', 'upgrade_buy',
]);

// 複数タブのライター状態を純粋に判定する（ロック記録が新しい別タブが居れば読み取り専用）。
export function computeWriterState(nowMs, lockRecord, myWriterId, staleMs = 15000) {
  if (!lockRecord || typeof lockRecord !== 'object') return { writer: true, holder: null };
  if (lockRecord.writerId === myWriterId) return { writer: true, holder: myWriterId };
  const fresh = typeof lockRecord.ts === 'number' && (nowMs - lockRecord.ts) < staleMs;
  if (fresh) return { writer: false, holder: lockRecord.writerId };
  return { writer: true, holder: null }; // 古いロックは無効
}

export class SaveCoordinator {
  constructor(opts = {}) {
    this.primary = opts.primary || null;   // 主保存先アダプター
    this.mirror = opts.mirror || null;     // ミラー保存先（フォルダ接続時のブラウザ）
    this.config = {
      autosaveDebounceMs: 800, maxAutoBackups: 10, maxManualBackups: 5, autoBackupMinIntervalSec: 300,
      ...(opts.config || {}),
    };
    this.meta = { saveVersion: 5, gameVersion: '0.0.0', writerId: (opts.meta && opts.meta.writerId) || newId('writer'), ...(opts.meta || {}) };
    this._nowMs = opts.nowMs || (() => Date.now());
    this._nowIso = opts.nowIso || (() => new Date().toISOString());
    this._schedule = opts.schedule || ((fn, ms) => (typeof setTimeout !== 'undefined' ? setTimeout(fn, ms) : null));
    this._onStatus = opts.onStatus || null;

    this._pending = new Map();     // type -> { payload, reason, backup }
    this._saveIds = {};            // type -> saveId（保存系列の同一性）
    this._createdAt = {};          // type -> createdAt
    this._lastAutoBackupMs = {};   // type -> ms
    this._flushing = false;
    this._timer = null;
    this._broadcast = null;
    this.status = {
      mode: this.primary?.id || 'none', folderState: 'disconnected',
      saving: false, lastSaveAt: null, lastResult: null, degraded: false, readOnly: false,
    };
    this._initBroadcast();
  }

  _initBroadcast() {
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        this._broadcast = new BroadcastChannel('rfs_save');
        this._broadcast.onmessage = (ev) => this._onBroadcast(ev.data);
      }
    } catch (e) { this._broadcast = null; }
  }

  _onBroadcast(data) {
    if (!data || data.writerId === this.meta.writerId) return;
    if (data.type === 'save') {
      // 別タブが保存した。自タブがライターでなければ状態を通知（UI が再読込を促す）。
      this._emit();
    } else if (data.type === 'claim') {
      // 別タブがライター権を取得 → 自タブは読み取り専用へ。
      this.status.readOnly = true; this._emit();
    }
  }

  setAdapters(primary, mirror) {
    this.primary = primary || null;
    this.mirror = mirror || null;
    this.status.mode = this.primary?.id || 'none';
    this._emit();
  }

  setFolderState(state) { this.status.folderState = state; this._emit(); }

  _emit() { if (this._onStatus) { try { this._onStatus({ ...this.status }); } catch (e) { /* noop */ } } }

  // 既存データから saveId/createdAt を引き継ぐ（保存系列の同一性維持）。
  seed(type, env) {
    if (env && env.saveId) { this._saveIds[type] = env.saveId; this._createdAt[type] = env.createdAt || this._nowIso(); }
  }
  // 新しい保存系列を開始（インポート/リセット/他方採用時）。
  resetLineage(type) { this._saveIds[type] = newId('save'); this._createdAt[type] = this._nowIso(); }
  resetAllLineage() { for (const t of SAVE_TYPES) this.resetLineage(t); }

  // 保存要求。payload はゲームデータ本体（エンベロープの payload）。
  notify(type, payload, options = {}) {
    if (!SAVE_TYPES.includes(type)) return;
    const prev = this._pending.get(type);
    this._pending.set(type, {
      payload,
      reason: options.reason || 'auto',
      backup: (prev && prev.backup) || !!options.backup || IMPORTANT_REASONS.has(options.reason),
    });
    if (options.immediate) { this.flushNow(); return; }
    this._scheduleFlush();
  }

  _scheduleFlush() {
    if (this._timer != null) return;
    this._timer = this._schedule(() => { this._timer = null; this.flushNow(); }, this.config.autosaveDebounceMs);
  }

  // 保留中の保存をまとめて処理する（直列化・最新のみ書き込み）。
  async flushNow() {
    if (this._flushing) { this._flushAgain = true; return this._flushPromise; }
    if (this._pending.size === 0) return { ok: true, empty: true };
    this._flushing = true;
    this.status.saving = true; this._emit();
    this._flushPromise = this._drain();
    const res = await this._flushPromise;
    this._flushing = false;
    this.status.saving = false;
    this.status.lastResult = res.ok ? 'success' : 'error';
    this.status.lastSaveAt = this._nowIso();
    this._emit();
    if (this._flushAgain) { this._flushAgain = false; return this.flushNow(); }
    return res;
  }

  async _drain() {
    // profile → activeRun → settings の順に処理し、最後に manifest を更新する。
    const order = ['profile', 'activeRun', 'settings'].filter((t) => this._pending.has(t));
    let allOk = true; let anyPrimaryFail = false;
    for (const type of order) {
      const job = this._pending.get(type);
      this._pending.delete(type);
      const r = await this._writeType(type, job);
      if (!r.ok) allOk = false;
      if (r.primaryFailed) anyPrimaryFail = true;
    }
    // manifest（フォルダのみ・最後）。
    if (this.primary && typeof this.primary.writeManifest === 'function' && this.primary.isAvailable && this.primary.isAvailable()) {
      try { await this.primary.writeManifest(await this._buildManifest()); } catch (e) { /* 致命的ではない */ }
    }
    this._heartbeatLock();
    this.status.degraded = anyPrimaryFail;
    return { ok: allOk, degraded: anyPrimaryFail };
  }

  async _writeType(type, job) {
    const saveId = this._saveIds[type] || (this._saveIds[type] = newId('save'));
    const createdAt = this._createdAt[type] || (this._createdAt[type] = this._nowIso());
    const env = makeEnvelope({
      type, payload: job.payload, saveVersion: this.meta.saveVersion, gameVersion: this.meta.gameVersion,
      writerId: this.meta.writerId, saveId, createdAt, nowIso: this._nowIso(),
    });

    // バックアップ方針: 重要理由は毎回、通常は最小間隔を超えたときのみ。上書き前の既存データを退避。
    if (this._shouldBackup(type, job)) await this._backupExisting(type, job.reason);

    let primaryFailed = false;
    let ok = true;
    if (this.primary) {
      const r = await safe(() => this.primary.write(type, env));
      if (!r || !r.ok) {
        primaryFailed = true;
        console.warn('[SaveCoordinator] primary 書き込み失敗', type, r && r.error);
        // フォールバック: ミラー（ブラウザ）が別にあればそこへ、無ければ失敗を記録。
        if (this.mirror) { const rm = await safe(() => this.mirror.write(type, env)); ok = !!(rm && rm.ok); }
        else ok = false;
      } else if (this.mirror) {
        // 成功時もミラーへ複製（フォルダ接続中のブラウザ内バックアップ）。
        await safe(() => this.mirror.write(type, env));
      }
    } else if (this.mirror) {
      const rm = await safe(() => this.mirror.write(type, env));
      ok = !!(rm && rm.ok);
    } else ok = false;

    // バックアップ世代の剪定。
    for (const ad of [this.primary, this.mirror]) {
      if (ad && typeof ad.pruneBackups === 'function') await safe(() => ad.pruneBackups({ maxAuto: this.config.maxAutoBackups, maxManual: this.config.maxManualBackups }));
    }

    // 他タブへ保存を通知。
    this._postBroadcast({ type: 'save', writerId: this.meta.writerId, saveId, saveType: type });
    return { ok, primaryFailed };
  }

  // 途中セーブ削除など、即時にファイル自体を消す。
  async removeNow(type) {
    this._pending.delete(type);
    for (const ad of [this.primary, this.mirror]) {
      if (ad && ad.isAvailable && ad.isAvailable() && typeof ad.remove === 'function') await safe(() => ad.remove(type));
    }
    this._postBroadcast({ type: 'save', writerId: this.meta.writerId, saveType: type });
  }

  _shouldBackup(type, job) {
    if (job.backup || IMPORTANT_REASONS.has(job.reason)) return true;
    const last = this._lastAutoBackupMs[type] || 0;
    const now = this._nowMs();
    if (now - last >= this.config.autoBackupMinIntervalSec * 1000) return true;
    return false;
  }

  async _backupExisting(type, reason) {
    const kind = reason === 'manual' ? 'manual'
      : (reason === 'import' ? 'import' : (reason === 'migration' ? 'migration' : (reason === 'conflict' ? 'conflict' : 'auto')));
    for (const ad of [this.primary, this.mirror]) {
      if (!ad || typeof ad.createBackup !== 'function' || !(ad.isAvailable && ad.isAvailable())) continue;
      const existing = await safe(() => ad.read(type));
      if (existing) await safe(() => ad.createBackup(type, existing, kind));
    }
    if (kind === 'auto') this._lastAutoBackupMs[type] = this._nowMs();
  }

  async _buildManifest() {
    const now = this._nowIso();
    const files = {};
    for (const t of SAVE_TYPES) files[t] = { name: ({ profile: 'profile.json', activeRun: 'active_run.json', settings: 'settings.json' })[t], saveId: this._saveIds[t] || null };
    let backupCount = 0;
    if (this.primary && typeof this.primary.listBackups === 'function') { const b = await safe(() => this.primary.listBackups()); backupCount = (b && b.length) || 0; }
    return {
      formatVersion: 1, gameVersion: this.meta.gameVersion, saveVersion: this.meta.saveVersion,
      createdAt: this._manifestCreatedAt || (this._manifestCreatedAt = now), updatedAt: now,
      latestSaveId: this._saveIds.profile || null,
      profileUpdatedAt: now, activeRunUpdatedAt: now, settingsUpdatedAt: now,
      backupCount, writerId: this.meta.writerId, files,
    };
  }

  // ---- 複数タブ制御（localStorage ロック + BroadcastChannel） ----
  refreshWriterState(staleMs = 15000) {
    const lock = this._readLock();
    const st = computeWriterState(this._nowMs(), lock, this.meta.writerId, staleMs);
    this.status.readOnly = !st.writer;
    return st;
  }
  claimWriter() {
    this._writeLock({ writerId: this.meta.writerId, ts: this._nowMs() });
    this.status.readOnly = false;
    this._postBroadcast({ type: 'claim', writerId: this.meta.writerId });
    this._emit();
  }
  _heartbeatLock() { if (!this.status.readOnly) this._writeLock({ writerId: this.meta.writerId, ts: this._nowMs() }); }
  _readLock() { try { if (typeof localStorage === 'undefined') return null; const r = localStorage.getItem('rfs_writer_lock'); return r ? JSON.parse(r) : null; } catch (e) { return null; } }
  _writeLock(v) { try { if (typeof localStorage !== 'undefined') localStorage.setItem('rfs_writer_lock', JSON.stringify(v)); } catch (e) { /* noop */ } }
  _postBroadcast(msg) { try { if (this._broadcast) this._broadcast.postMessage(msg); } catch (e) { /* noop */ } }

  destroy() { try { if (this._broadcast) this._broadcast.close(); } catch (e) { /* noop */ } }
}

async function safe(fn) {
  try { return await fn(); } catch (e) { console.warn('[SaveCoordinator]', e); return null; }
}
