// タイトル画面。M1 では「はじめから」で戦闘を開始できる。
// 拠点 / データ管理 / 設定 は後続 Milestone のプレースホルダ。

import { GAME_VERSION, GAME_WIDTH, GAME_HEIGHT } from '../config/game-config.js';
import { SaveManager } from '../systems/SaveManager.js';
import { DataManager } from '../systems/DataManager.js';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('TitleScene');
  }

  create() {
    const cx = GAME_WIDTH / 2;
    this.add.rectangle(cx, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0a0608);

    // 背景の火の粉演出（軽量）。
    for (let i = 0; i < 24; i++) {
      const x = Phaser.Math.Between(0, GAME_WIDTH);
      const y = Phaser.Math.Between(0, GAME_HEIGHT);
      const s = this.add.rectangle(x, y, 2, 2, 0xff7043, Phaser.Math.FloatBetween(0.2, 0.7));
      this.tweens.add({
        targets: s, y: y - Phaser.Math.Between(20, 60), alpha: 0,
        duration: Phaser.Math.Between(1500, 3500), repeat: -1, delay: Phaser.Math.Between(0, 2000),
        onRepeat: () => { s.y = y; s.x = Phaser.Math.Between(0, GAME_WIDTH); s.alpha = 0.5; },
      });
    }

    this.add.text(cx, 60, 'Reincarnation', { fontSize: '26px', color: '#ff5722', fontStyle: 'bold' }).setOrigin(0.5);
    this.add.text(cx, 88, 'Flame Survivor', { fontSize: '26px', color: '#ffab40', fontStyle: 'bold' }).setOrigin(0.5);
    this.add.text(cx, 116, '転生する火の魔女', { fontSize: '11px', color: '#ffe0b2' }).setOrigin(0.5);

    const hasRun = SaveManager.hasActiveRun();

    const items = [
      { label: 'はじめから', enabled: true, onClick: () => this.startNewRun() },
      { label: '続きから', enabled: hasRun, onClick: () => this.continueRun() },
      { label: '拠点', enabled: true, onClick: () => this.toast('拠点は Milestone 3 で実装予定') },
      { label: 'データ管理', enabled: true, onClick: () => this.toast('データ管理は Milestone 5 で実装予定') },
      { label: '設定', enabled: true, onClick: () => this.toast('設定は Milestone 2 で実装予定') },
    ];

    let y = 150;
    for (const it of items) {
      this.makeButton(cx, y, it.label, it.enabled, it.onClick);
      y += 26;
    }

    // フッター情報。
    this.add.text(8, GAME_HEIGHT - 30, `version ${GAME_VERSION}`, { fontSize: '9px', color: '#8d6e63' });
    this.saveStatusText = this.add.text(8, GAME_HEIGHT - 18, '', { fontSize: '9px', color: '#8d6e63' });
    this.updateSaveStatus();

    this.add.text(GAME_WIDTH - 8, GAME_HEIGHT - 18, '⛶ 全画面（画面右上ボタン / F11）', { fontSize: '9px', color: '#8d6e63' }).setOrigin(1, 0);

    // 数字キー等のショートカット（1: はじめから）。
    this.input.keyboard.on('keydown-ENTER', () => this.startNewRun());
  }

  updateSaveStatus() {
    const folder = SaveManager.folderConnected ? 'フォルダ接続済み' : 'フォルダ未接続';
    this.saveStatusText.setText(`${SaveManager.statusText} / ${folder}`);
  }

  makeButton(x, y, label, enabled, onClick) {
    const color = enabled ? '#ffe0b2' : '#5d4037';
    const txt = this.add.text(x, y, label, { fontSize: '14px', color }).setOrigin(0.5);
    if (!enabled) return txt;
    txt.setInteractive({ useHandCursor: true });
    txt.on('pointerover', () => txt.setColor('#ff5722'));
    txt.on('pointerout', () => txt.setColor('#ffe0b2'));
    txt.on('pointerdown', onClick);
    return txt;
  }

  toast(message) {
    if (this._toast) this._toast.destroy();
    this._toast = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 50, message, {
      fontSize: '11px', color: '#fff', backgroundColor: '#3e2723', padding: { x: 8, y: 4 },
    }).setOrigin(0.5);
    this.time.delayedCall(1800, () => { if (this._toast) { this._toast.destroy(); this._toast = null; } });
  }

  startNewRun() {
    const difficulty = 1;
    this.scene.start('BattleScene', { difficulty, resume: null });
  }

  continueRun() {
    const run = SaveManager.loadActiveRun();
    this.scene.start('BattleScene', { difficulty: run?.difficulty || 1, resume: run });
  }
}
