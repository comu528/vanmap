// データ管理画面（Milestone 5-B）。保存状態の表示、フォルダ接続/解除/再接続、今すぐ保存、
// 再読込、JSON エクスポート/インポート、バックアップ一覧/復元/削除、競合解決、セーブ初期化。
// UI はこの画面に閉じ、既存のゲーム UI は変更しない（データ管理に必要な追加のみ）。

import { GAME_WIDTH, GAME_HEIGHT } from '../config/game-config.js';
import { SaveManager } from '../systems/SaveManager.js';
import { SaveService } from '../storage/SaveService.js';
import { DataManager } from '../systems/DataManager.js';
import { validateImportBundle, sanitize } from '../storage/SaveValidator.js';
import { formatTime } from '../utils/time.js';

const FOLDER_STATE_LABEL = {
  disconnected: '未接続', connected: '接続済み', 'needs-permission': '再許可が必要',
  denied: '権限拒否', unsupported: 'API非対応', error: 'エラー', 'read-only': '読み取り可・書込不可',
};

export class DataManagementScene extends Phaser.Scene {
  constructor() { super('DataManagementScene'); }

  init(data) { this._from = (data && data.from) || 'TitleScene'; }

  create() {
    this._overlay = null;
    this._busy = false;
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0a0608);
    this.add.text(12, 6, 'データ管理', { fontSize: '15px', color: '#80deea', fontStyle: 'bold' });
    const back = this.add.text(GAME_WIDTH - 12, 8, '← 戻る', { fontSize: '11px', color: '#bcaaa4', backgroundColor: '#2a1e2e', padding: { x: 6, y: 3 } }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    back.on('pointerdown', () => this.scene.start(this._from));

    this.statusText = this.add.text(12, 30, '', { fontSize: '9px', color: '#ffe0b2', lineSpacing: 2 });
    this.msgText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 10, '', { fontSize: '9px', color: '#a5d6a7' }).setOrigin(0.5);

    this._buildButtons();
    this.refreshStatus();
    SaveService.onStatus(() => { if (this.scene.isActive()) this.refreshStatus(); });
    this.events.once('shutdown', () => SaveService.onStatus(null));

    // 起動時に未解決の競合があれば解決画面を出す。
    if (SaveService.pendingConflict) this.time.delayedCall(200, () => this.showConflict());

    if (window.RFS_DEBUG) {
      const d = this.add.text(GAME_WIDTH / 2 + 60, 8, '⚙debug', { fontSize: '9px', color: '#80deea', backgroundColor: '#1a2a2e', padding: { x: 4, y: 2 } }).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      d.on('pointerdown', () => this.showDebug());
    }
  }

  mkBtn(x, y, label, cb, opts = {}) {
    const enabled = opts.enabled !== false;
    const t = this.add.text(x, y, label, {
      fontSize: opts.fontSize || '10px', color: enabled ? (opts.color || '#fff') : '#5d4037',
      backgroundColor: enabled ? (opts.bg || '#1a3a3e') : '#241a20', padding: { x: 6, y: 3 },
    });
    if (enabled) { t.setInteractive({ useHandCursor: true }); t.on('pointerdown', () => { if (!this._busy) cb(); }); }
    return t;
  }

  _buildButtons() {
    const supported = SaveService.supported();
    let ly = 118;
    this.add.text(12, 104, '― 保存フォルダ ―', { fontSize: '9px', color: '#80deea' });
    this._folderBtns = this.add.container(0, 0);
    const fbtns = [
      ['保存フォルダを接続', () => this.doConnect(), { enabled: supported }],
      ['再接続（再許可）', () => this.doReconnect()],
      ['接続を解除', () => this.doDisconnect()],
      ['今すぐ保存', () => this.doSaveNow()],
      ['フォルダから再読込', () => this.doReload('folder')],
      ['ブラウザから再読込', () => this.doReload('browser')],
    ];
    let fx = 12;
    for (const [label, cb, o] of fbtns) { const b = this.mkBtn(fx, ly, label, cb, o || {}); this._folderBtns.add(b); fx += b.width + 6; if (fx > GAME_WIDTH - 120) { fx = 12; ly += 20; } }

    let ry = ly + 30;
    this.add.text(12, ry - 14, '― データ ―', { fontSize: '9px', color: '#80deea' });
    const dbtns = [
      ['一式エクスポート', () => this.doExport('all')],
      ['profileのみ', () => this.doExport('profile')],
      ['active_runのみ', () => this.doExport('activeRun')],
      ['settingsのみ', () => this.doExport('settings')],
      ['JSONインポート', () => this.doImport()],
      ['バックアップ一覧', () => this.showBackups()],
      ['手動バックアップ', () => this.doManualBackup()],
      ['セーブ初期化', () => this.showResetConfirm()],
    ];
    let dx = 12;
    for (const [label, cb] of dbtns) { const b = this.mkBtn(dx, ry, label, cb, { bg: '#3a1a1e' }); dx += b.width + 6; if (dx > GAME_WIDTH - 100) { dx = 12; ry += 20; } }

    if (!supported) this.add.text(12, ry + 22, '※ このブラウザはフォルダ保存(File System Access API)に非対応です。ブラウザ内保存とJSON入出力が使えます。', { fontSize: '8px', color: '#8d6e63', wordWrap: { width: GAME_WIDTH - 24 } });
  }

  refreshStatus() {
    const s = SaveService.status;
    const co = SaveService.coordinator?.status || {};
    const prof = SaveManager.rawProfile();
    const run = SaveManager.rawActiveRun();
    const lines = [
      `保存方式: ${s.mode === 'folder' ? 'フォルダ + ブラウザ(ミラー)' : (s.mode === 'localStorage' ? 'ブラウザ内(localStorage)' : 'メモリのみ')}`,
      `フォルダ接続: ${FOLDER_STATE_LABEL[s.folderState] || s.folderState}${SaveService.supported() ? '' : '（API非対応）'}`,
      `最終保存: ${co.lastSaveAt ? new Date(co.lastSaveAt).toLocaleString() : '—'}  結果: ${co.lastResult || '—'}${co.saving ? ' （保存中…）' : ''}${co.degraded ? ' ⚠フォルダ書込失敗→ブラウザ' : ''}`,
      `ブラウザ内データ: ${prof ? 'あり' : 'なし'}  フォルダ内データ: ${s.folderState === 'connected' ? '接続中' : '—'}  途中戦闘: ${run && run.inProgress ? 'あり' : 'なし'}`,
      `saveVersion ${DataManager.balance.saveVersion} / gameVersion ${DataManager.balance.gameVersion}${co.readOnly ? '  ⚠複数タブ: 読み取り専用' : ''}${SaveService.pendingConflict ? '  ⚠競合あり' : ''}`,
    ];
    this.statusText.setText(lines.join('\n'));
    if (co.readOnly && !this._claimBtn) {
      this._claimBtn = this.mkBtn(GAME_WIDTH - 150, 30, '書込権を引き継ぐ', () => { SaveService.claimWriter(); SaveService.reloadFromBrowser(); this.toast('このタブが書き込み可能になりました'); this.refreshStatus(); }, { bg: '#5d2e1a' });
    }
    if (SaveService.pendingConflict && !this._conflictBtn) {
      this._conflictBtn = this.mkBtn(GAME_WIDTH - 150, 50, '⚠ 競合を解決', () => this.showConflict(), { bg: '#7a2e1a' });
    }
  }

  toast(msg, color = '#a5d6a7') { this.msgText.setColor(color).setText(msg); this.time.delayedCall(3000, () => { if (this.msgText.text === msg) this.msgText.setText(''); }); }

  async _run(label, fn) {
    if (this._busy) return;
    this._busy = true; this.toast(label + '…', '#ffe0b2');
    try { const r = await fn(); this._busy = false; return r; }
    catch (e) { console.error('[DataManagement]', label, e); this._busy = false; this.toast(label + ' に失敗しました（コンソール参照）', '#ff8a80'); return null; }
  }

  // ---- フォルダ操作 ----
  async doConnect() {
    const r = await this._run('フォルダ接続', () => SaveService.connectFolder());
    if (!r) return;
    if (r.ok) { this.toast(r.conflict ? 'フォルダ接続。競合が見つかりました' : 'フォルダに接続しました'); if (r.conflict) this.showConflict(); }
    else this.toast(r.reason === 'cancelled' ? '接続をキャンセルしました' : (r.reason === 'unsupported' ? 'このブラウザは非対応です' : (r.reason === 'denied' ? '権限が拒否されました' : '接続に失敗しました')), r.reason === 'cancelled' ? '#ffe0b2' : '#ff8a80');
    this.refreshStatus();
  }
  async doReconnect() { const r = await this._run('再接続', () => SaveService.reconnect()); if (r && r.ok) { this.toast('再接続しました'); if (r.conflict) this.showConflict(); } else if (r) this.toast('再接続に失敗しました', '#ff8a80'); this.refreshStatus(); }
  async doDisconnect() { await this._run('接続解除', () => SaveService.disconnect()); this.toast('フォルダ接続を解除しました（ブラウザ保存を継続）'); this.refreshStatus(); }
  async doSaveNow() { const r = await this._run('保存', () => SaveService.saveNow('manual')); if (r) this.toast(r.ok ? '保存しました' : '保存に一部失敗（ブラウザ内には保存）', r.ok ? '#a5d6a7' : '#ffab40'); this.refreshStatus(); }
  async doReload(which) {
    await this._run('再読込', () => which === 'folder' ? SaveService.reloadFromFolder() : SaveService.reloadFromBrowser());
    this.toast(`${which === 'folder' ? 'フォルダ' : 'ブラウザ'}から再読込しました`); this.refreshStatus();
  }

  // ---- エクスポート ----
  doExport(which) {
    try {
      const bundle = SaveManager.exportBundle();
      let payload = bundle, suffix = 'Save';
      if (which === 'profile') { payload = { exportFormatVersion: 1, exportedAt: bundle.exportedAt, gameVersion: bundle.gameVersion, saveVersion: bundle.saveVersion, profile: bundle.profile }; suffix = 'Profile'; }
      else if (which === 'activeRun') { payload = { exportFormatVersion: 1, exportedAt: bundle.exportedAt, gameVersion: bundle.gameVersion, saveVersion: bundle.saveVersion, activeRun: bundle.activeRun }; suffix = 'ActiveRun'; }
      else if (which === 'settings') { payload = { exportFormatVersion: 1, exportedAt: bundle.exportedAt, gameVersion: bundle.gameVersion, saveVersion: bundle.saveVersion, settings: bundle.settings }; suffix = 'Settings'; }
      const ts = new Date().toISOString().replace(/[-:T]/g, '').replace(/\..+/, '');
      this._download(`ReincarnationFlameSurvivor_${suffix}_${ts}.json`, JSON.stringify(payload, null, 2));
      this.toast('エクスポートしました（ダウンロード）');
    } catch (e) { console.error(e); this.toast('エクスポートに失敗しました', '#ff8a80'); }
  }

  _download(filename, text) {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    document.body.removeChild(a); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---- インポート ----
  doImport() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'application/json,.json';
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const maxBytes = DataManager.saveConfig.maxImportBytes || 2 * 1024 * 1024;
      if (file.size > maxBytes) { this.toast(`ファイルが大きすぎます（${file.size} > ${maxBytes} bytes）`, '#ff8a80'); return; }
      const reader = new FileReader();
      reader.onload = () => this._handleImportText(String(reader.result || ''), file.size);
      reader.onerror = () => this.toast('ファイルの読み込みに失敗しました', '#ff8a80');
      reader.readAsText(file);
    };
    input.click();
  }

  _refs() {
    return {
      difficultyIds: new Set(DataManager.balance.difficulties.map((d) => d.id)),
      skillIds: new Set(DataManager.skills.map((s) => s.id)),
      upgradeIds: new Set(DataManager.upgrades.map((u) => u.id)),
      reincNodeIds: new Set(DataManager.reincarnationNodes.map((n) => n.id)),
      evolutionIds: new Set(DataManager.evolutions.map((e) => e.id)),
    };
  }

  _handleImportText(text, size) {
    let bundle;
    try { bundle = JSON.parse(text); }
    catch (e) { this.toast('JSON 構文エラーのため読み込めません', '#ff8a80'); return; }
    const res = validateImportBundle(bundle, { rawBytes: size, maxBytes: DataManager.saveConfig.maxImportBytes, saveVersion: DataManager.balance.saveVersion, refs: this._refs() });
    if (!res.ok) { this.showImportErrors(res.errors); return; }
    this.showImportConfirm(sanitize(bundle));
  }

  showImportErrors(errors) {
    this.showModal('インポートできません', (ui, cx, top) => {
      ui.add(this.add.text(cx, top + 8, '検証に失敗しました:', { fontSize: '10px', color: '#ff8a80' }).setOrigin(0.5));
      errors.slice(0, 8).forEach((e, i) => ui.add(this.add.text(cx, top + 26 + i * 14, '・' + e, { fontSize: '9px', color: '#ffab91', wordWrap: { width: 520 } }).setOrigin(0.5, 0)));
    }, [['閉じる', () => this.closeOverlay()]]);
  }

  _summ(bundle) {
    const p = (bundle && bundle.profile) || {};
    const st = p.statistics || {};
    const upTotal = Object.values(p.permanentUpgrades || {}).reduce((a, b) => a + (b || 0), 0);
    const rTotal = Object.values(p.reincarnationUpgrades || {}).reduce((a, b) => a + (b || 0), 0);
    return {
      updatedAt: p.updated_at || '—', reincarnationCount: p.reincarnationCount ?? 0,
      embers: p.embers ?? 0, soulflame: p.soulflame ?? 0, upTotal, rTotal,
      unlocked: (p.unlockedDifficulties || []).length, mastery: Object.keys(p.skillMastery || {}).length,
      playTime: (st.totalPlayTime || 0), hasRun: !!(bundle.activeRun && bundle.activeRun.inProgress),
    };
  }

  showImportConfirm(bundle) {
    const cur = this._summ({ profile: SaveManager.rawProfile(), activeRun: SaveManager.rawActiveRun() });
    const imp = this._summ(bundle);
    this.showModal('インポートの確認', (ui, cx, top) => {
      ui.add(this.add.text(cx - 130, top, '現在データ', { fontSize: '10px', color: '#80deea' }).setOrigin(0.5, 0));
      ui.add(this.add.text(cx + 130, top, 'インポート', { fontSize: '10px', color: '#ffd54f' }).setOrigin(0.5, 0));
      const rows = [
        ['更新日時', (m) => String(m.updatedAt).replace('T', ' ').replace(/\..+/, '')],
        ['転生回数', (m) => m.reincarnationCount], ['残り火', (m) => m.embers], ['魂炎', (m) => m.soulflame],
        ['恒久強化合計', (m) => m.upTotal], ['魂炎強化合計', (m) => m.rTotal], ['解放難易度', (m) => m.unlocked],
        ['熟練スキル数', (m) => m.mastery], ['累計プレイ', (m) => formatTime(m.playTime)], ['途中戦闘', (m) => (m.hasRun ? 'あり' : 'なし')],
      ];
      rows.forEach(([label, f], i) => {
        const y = top + 18 + i * 13;
        ui.add(this.add.text(cx, y, label, { fontSize: '8px', color: '#bcaaa4' }).setOrigin(0.5, 0));
        ui.add(this.add.text(cx - 130, y, String(f(cur)), { fontSize: '8px', color: '#fff' }).setOrigin(0.5, 0));
        ui.add(this.add.text(cx + 130, y, String(f(imp)), { fontSize: '8px', color: '#ffe0b2' }).setOrigin(0.5, 0));
      });
      ui.add(this.add.text(cx, top + 158, '※ 自動マージしません。置換前に現在データを自動バックアップします。', { fontSize: '8px', color: '#8d6e63' }).setOrigin(0.5, 0));
    }, [
      ['インポートで置換', async () => { this.closeOverlay(); await this._run('インポート', async () => { await SaveService.makeManualBackup(); SaveManager.applyImported({ profile: bundle.profile, settings: bundle.settings, activeRun: bundle.activeRun }, 'import'); await SaveService.saveNow('import'); }); this.toast('インポートしました'); this.refreshStatus(); }, '#7a2e1a'],
      ['現在データを維持', () => { this.closeOverlay(); this.toast('インポートを取り消しました', '#ffe0b2'); }],
    ]);
  }

  // ---- バックアップ ----
  async showBackups() {
    const list = await this._run('バックアップ取得', () => SaveService.listBackups());
    if (!list) return;
    this.showModal(`バックアップ一覧（${list.length}件）`, (ui, cx, top) => {
      if (list.length === 0) { ui.add(this.add.text(cx, top + 20, 'バックアップはまだありません。', { fontSize: '10px', color: '#bcaaa4' }).setOrigin(0.5)); return; }
      list.slice(0, 9).forEach((b, i) => {
        const y = top + 6 + i * 18;
        const s = b.summary || {};
        const when = (b.createdAt || '').replace('T', ' ').replace(/\..+/, '');
        ui.add(this.add.text(cx - 250, y, `${b.type}/${b.kind}`, { fontSize: '8px', color: '#80deea' }).setOrigin(0, 0));
        ui.add(this.add.text(cx - 180, y, `${when} v${s.saveVersion || '?'} 転生${s.reincarnationCount ?? '-'} 残${s.embers ?? '-'} 魂${s.soulflame ?? '-'} ${b.size || 0}B`, { fontSize: '8px', color: '#ffe0b2' }).setOrigin(0, 0));
        const rb = this.add.text(cx + 180, y - 1, '復元', { fontSize: '8px', color: '#fff', backgroundColor: '#5d2e1a', padding: { x: 4, y: 1 } }).setInteractive({ useHandCursor: true });
        rb.on('pointerdown', () => this.confirmRestore(b));
        const db = this.add.text(cx + 218, y - 1, '削除', { fontSize: '8px', color: '#fff', backgroundColor: '#3a1a1e', padding: { x: 4, y: 1 } }).setInteractive({ useHandCursor: true });
        db.on('pointerdown', async () => { await SaveService.deleteBackup(b.id); this.closeOverlay(); this.showBackups(); });
        ui.add([rb, db]);
      });
    }, [['閉じる', () => this.closeOverlay()]]);
  }

  confirmRestore(b) {
    this.showModal('復元の確認', (ui, cx, top) => {
      ui.add(this.add.text(cx, top + 10, `${b.type} を ${(b.createdAt || '').replace('T', ' ').replace(/\..+/, '')} の状態へ復元します。`, { fontSize: '10px', color: '#ffe0b2', align: 'center', wordWrap: { width: 500 } }).setOrigin(0.5, 0));
      ui.add(this.add.text(cx, top + 34, '※ 復元前に現在データを自動バックアップします。', { fontSize: '8px', color: '#8d6e63' }).setOrigin(0.5, 0));
    }, [
      ['復元する', async () => { this.closeOverlay(); const r = await this._run('復元', () => SaveService.restoreBackup(b.id)); if (r && r.ok) { this.toast('復元しました'); await SaveService.saveNow('conflict'); } this.refreshStatus(); }, '#7a2e1a'],
      ['キャンセル', () => this.closeOverlay()],
    ]);
  }

  async doManualBackup() { const r = await this._run('手動バックアップ', () => SaveService.makeManualBackup()); if (r) this.toast(r.ok ? `手動バックアップを作成（${r.count}件）` : 'バックアップ対象がありません', r.ok ? '#a5d6a7' : '#ffab40'); }

  // ---- 競合解決 ----
  showConflict() {
    const c = SaveService.pendingConflict;
    if (!c) { this.toast('競合はありません', '#ffe0b2'); return; }
    const bm = c.browser.meta, fm = c.folder.meta;
    this.showModal('保存データの競合', (ui, cx, top) => {
      ui.add(this.add.text(cx, top, `理由: ${c.reasons.join(' / ')}`, { fontSize: '8px', color: '#ff8a80', align: 'center', wordWrap: { width: 540 } }).setOrigin(0.5, 0));
      ui.add(this.add.text(cx - 140, top + 22, 'ブラウザ内', { fontSize: '10px', color: '#80deea' }).setOrigin(0.5, 0));
      ui.add(this.add.text(cx + 140, top + 22, 'フォルダ内', { fontSize: '10px', color: '#ffd54f' }).setOrigin(0.5, 0));
      const rows = [
        ['更新日時', (m) => String(m.updatedAt || '—').replace('T', ' ').replace(/\..+/, '')],
        ['転生回数', (m) => m.reincarnationCount], ['残り火(累計)', (m) => m.lifetimeEmbers], ['魂炎(累計)', (m) => m.lifetimeSoulflame],
        ['最高難易度', (m) => m.highestEverDifficulty], ['プレイ時間', (m) => formatTime(m.totalPlayTime)], ['途中戦闘', (m) => (m.hasActiveRun ? 'あり' : 'なし')],
      ];
      rows.forEach(([label, f], i) => {
        const y = top + 40 + i * 14;
        ui.add(this.add.text(cx, y, label, { fontSize: '8px', color: '#bcaaa4' }).setOrigin(0.5, 0));
        ui.add(this.add.text(cx - 140, y, String(f(bm)), { fontSize: '8px', color: '#fff' }).setOrigin(0.5, 0));
        ui.add(this.add.text(cx + 140, y, String(f(fm)), { fontSize: '8px', color: '#ffe0b2' }).setOrigin(0.5, 0));
      });
      ui.add(this.add.text(cx, top + 142, `推奨: ${c.recommendation.recommended === 'browser' ? 'ブラウザ内' : 'フォルダ内'}（${c.recommendation.reasons.join('・')}）※最終決定はあなたです`, { fontSize: '8px', color: '#a5d6a7', align: 'center', wordWrap: { width: 540 } }).setOrigin(0.5, 0));
    }, [
      ['ブラウザ内を採用', async () => { this.closeOverlay(); await this._run('競合解決', () => SaveService.resolveConflict('browser')); this.toast('ブラウザ内データを採用しました'); this._conflictBtn = this._destroyIf(this._conflictBtn); this.refreshStatus(); }, '#1a3a5e'],
      ['フォルダ内を採用', async () => { this.closeOverlay(); await this._run('競合解決', () => SaveService.resolveConflict('folder')); this.toast('フォルダ内データを採用しました'); this._conflictBtn = this._destroyIf(this._conflictBtn); this.refreshStatus(); }, '#5d4a1a'],
      ['両方エクスポート', () => { this.doExport('all'); this.toast('現在(ブラウザ)をエクスポート。フォルダ側は「フォルダから再読込」後に再エクスポートできます'); }],
      ['読み取り専用で開始', () => { this.closeOverlay(); this.toast('読み取り専用で開始します（保存は競合解決まで保留）', '#ffab40'); }],
    ]);
  }

  _destroyIf(o) { if (o) o.destroy(); return null; }

  // ---- 初期化（二段階） ----
  showResetConfirm() {
    this.showModal('セーブ初期化', (ui, cx, top) => {
      ui.add(this.add.text(cx, top + 6, '初期化するデータを選んでください。まずエクスポートを推奨します。', { fontSize: '9px', color: '#ff8a80', align: 'center', wordWrap: { width: 520 } }).setOrigin(0.5, 0));
      ui.add(this.add.text(cx, top + 26, 'この操作は取り消せません。', { fontSize: '9px', color: '#ffab91' }).setOrigin(0.5, 0));
      const eb = this.add.text(cx, top + 48, '先にエクスポート', { fontSize: '10px', color: '#fff', backgroundColor: '#1a3a3e', padding: { x: 8, y: 3 } }).setOrigin(0.5, 0).setInteractive({ useHandCursor: true });
      eb.on('pointerdown', () => this.doExport('all'));
      ui.add(eb);
    }, [
      ['ブラウザ内を初期化', () => this.confirmReset('browser')],
      ['フォルダ内を初期化', () => this.confirmReset('folder'), SaveService.status.folderState === 'connected' ? '#5d4a1a' : null],
      ['キャンセル', () => this.closeOverlay()],
    ]);
  }

  confirmReset(target) {
    this.showModal('最終確認', (ui, cx, top) => {
      const label = target === 'folder' ? 'フォルダ内' : 'ブラウザ内';
      ui.add(this.add.text(cx, top + 20, `${label}のセーブデータを本当に初期化しますか？`, { fontSize: '11px', color: '#ff8a80', align: 'center', wordWrap: { width: 500 } }).setOrigin(0.5, 0));
    }, [
      ['はい、初期化する', async () => {
        this.closeOverlay();
        await this._run('初期化', async () => {
          if (target === 'browser') { SaveManager.resetLocal(); }
          if (target === 'folder' && SaveService.folder && SaveService.folder.isAvailable()) { for (const t of ['profile', 'activeRun', 'settings']) await SaveService.folder.remove(t); }
        });
        this.toast('初期化しました'); this.refreshStatus();
      }, '#7a2e1a'],
      ['キャンセル', () => this.closeOverlay()],
    ]);
  }

  // ---- デバッグ（?debug=1） ----
  showDebug() {
    this.showModal('DEBUG（保存）', (ui, cx, top) => {
      const acts = [
        ['ブラウザ保存を強制', async () => { await SaveService.disconnect(); await SaveService.saveNow('manual'); this.toast('ブラウザ保存で保存'); }],
        ['書込失敗を模擬→保存', async () => { if (SaveService.folder) SaveService.folder.failWrites = true; if (SaveService.browser) SaveService.browser.failWrites = false; const primary = SaveService.coordinator.primary; if (primary && primary.write) { const orig = primary.write.bind(primary); primary.write = async () => ({ ok: false, error: 'simulated' }); await SaveService.saveNow('manual'); primary.write = orig; } this.toast('書込失敗を模擬（ミラーへフォールバック）', '#ffab40'); this.refreshStatus(); }],
        ['破損JSONを注入(profile)', () => { try { localStorage.setItem('rfs_env_profile', '{bad json'); this.toast('rfs_env_profile を破損させました（再読込で検証）', '#ffab40'); } catch (e) {} }],
        ['競合を生成', async () => { await this._genConflict(); }],
        ['profile v4 を生成→移行', () => { const v4 = { save_version: 4, game_version: '0.4.0', embers: 999, lifetimeEmbers: 9999, permanentUpgrades: { max_hp: 5 }, unlockedDifficulties: [1, 2], reincarnationCount: 1, soulflame: 3 }; localStorage.setItem('rfs_profile', JSON.stringify(v4)); location.reload(); }],
        ['バックアップ10世代生成', async () => { for (let i = 0; i < 11; i++) { const p = SaveManager.rawProfile() || {}; await (SaveService.folder && SaveService.folder.isAvailable() ? SaveService.folder : SaveService.browser).createBackup('profile', { type: 'profile', saveId: 's' + i, updatedAt: new Date().toISOString(), payload: { ...p, embers: i } }, 'auto'); } this.toast('バックアップを生成し剪定'); }],
        ['保存キュー/最終エラー表示', () => { const co = SaveService.coordinator; this.toast(`saving=${co.status.saving} last=${co.status.lastResult} degraded=${co.status.degraded} readOnly=${co.status.readOnly}`, '#80deea'); }],
      ];
      acts.forEach(([label, cb], i) => {
        const b = this.add.text(cx, top + 6 + i * 20, label, { fontSize: '9px', color: '#fff', backgroundColor: '#1a3a3e', padding: { x: 5, y: 2 } }).setOrigin(0.5, 0).setInteractive({ useHandCursor: true });
        b.on('pointerdown', () => { if (!this._busy) cb(); });
        ui.add(b);
      });
    }, [['閉じる', () => this.closeOverlay()]]);
  }

  async _genConflict() {
    // ブラウザ側の enveloped mirror を、別 writerId・別 saveId・低進行度に書き換えて競合を作る。
    try {
      const prof = SaveManager.rawProfile() || {};
      const fake = { formatVersion: 1, type: 'profile', saveVersion: 5, gameVersion: DataManager.balance.gameVersion, saveId: 'FAKE_' + Date.now(), createdAt: new Date().toISOString(), updatedAt: new Date(Date.now() - 86400000).toISOString(), writerId: 'other_tab', checksum: 'x', payload: { ...prof, reincarnationCount: (prof.reincarnationCount || 0) + 5, lifetimeSoulflame: (prof.lifetimeSoulflame || 0) + 999 } };
      SaveService.pendingConflict = { browser: { present: true, meta: { updatedAt: new Date().toISOString(), reincarnationCount: prof.reincarnationCount || 0, lifetimeEmbers: prof.lifetimeEmbers || 0, lifetimeSoulflame: prof.lifetimeSoulflame || 0, highestEverDifficulty: prof.highestEverDifficulty || 0, totalPlayTime: (prof.statistics || {}).totalPlayTime || 0, hasActiveRun: false } }, folder: { present: true, meta: { updatedAt: fake.updatedAt, reincarnationCount: fake.payload.reincarnationCount, lifetimeEmbers: prof.lifetimeEmbers || 0, lifetimeSoulflame: fake.payload.lifetimeSoulflame, highestEverDifficulty: prof.highestEverDifficulty || 0, totalPlayTime: (prof.statistics || {}).totalPlayTime || 0, hasActiveRun: false } }, reasons: ['デバッグ生成'], recommendation: { recommended: 'folder', reasons: ['進行度が高い'] } };
      this.closeOverlay(); this.showConflict();
    } catch (e) { console.error(e); }
  }

  // ---- 汎用モーダル ----
  showModal(title, buildFn, buttons) {
    this.closeOverlay();
    const cx = GAME_WIDTH / 2;
    const ui = this.add.container(0, 0).setDepth(3000);
    ui.add(this.add.rectangle(cx, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.9));
    ui.add(this.add.rectangle(cx, GAME_HEIGHT / 2, GAME_WIDTH - 30, GAME_HEIGHT - 40, 0x141018).setStrokeStyle(1, 0x80deea));
    ui.add(this.add.text(cx, 26, title, { fontSize: '13px', color: '#80deea', fontStyle: 'bold' }).setOrigin(0.5));
    try { buildFn(ui, cx, 46); } catch (e) { console.error(e); }
    let bx = 40;
    for (const [label, cb, bg] of buttons) {
      if (bg === null) continue;
      const b = this.add.text(bx, GAME_HEIGHT - 26, label, { fontSize: '10px', color: '#fff', backgroundColor: bg || '#2a1e2e', padding: { x: 8, y: 4 } }).setInteractive({ useHandCursor: true });
      b.on('pointerdown', () => { if (!this._busy || label.includes('キャンセル') || label.includes('閉じる')) cb(); });
      ui.add(b); bx += b.width + 8;
    }
    this._overlay = ui;
  }

  closeOverlay() { if (this._overlay) { this._overlay.destroy(true); this._overlay = null; } }
}
