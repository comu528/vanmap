// PauseMenu: 一時停止オーバーレイ（再開 / エフェクト品質・ダメージ数字・画面揺れ設定 / タイトルへ）。
// BattleScene から責務分離（M3）。設定の反映は scene.applyEffectSettings() に委譲する。

import { GAME_WIDTH, GAME_HEIGHT } from '../config/game-config.js';
import { SaveManager } from '../systems/SaveManager.js';

const QUALITIES = ['low', 'medium', 'high', 'ultra'];

export class PauseMenu {
  constructor(scene) {
    this.scene = scene;
    this.container = null;
  }

  open({ onResume, onTitle }) {
    const scene = this.scene;
    const cx = GAME_WIDTH / 2, cy = GAME_HEIGHT / 2;
    const ui = scene.add.container(0, 0).setScrollFactor(0).setDepth(1200);
    const bg = scene.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.72).setScrollFactor(0);
    const t = scene.add.text(cx, cy - 60, '一時停止', { fontSize: '18px', color: '#ffab40' }).setOrigin(0.5).setScrollFactor(0);
    const resume = scene.add.text(cx, cy - 26, '▶ 再開', { fontSize: '13px', color: '#ffe0b2' }).setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });
    const qLabel = scene.add.text(cx, cy + 2, '', { fontSize: '11px', color: '#80deea' }).setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });
    const dLabel = scene.add.text(cx, cy + 22, '', { fontSize: '11px', color: '#80deea' }).setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });
    const sLabel = scene.add.text(cx, cy + 42, '', { fontSize: '11px', color: '#80deea' }).setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });
    // 倍速（魂炎で解放済みのときのみ選択可能）
    const speedMax = scene.speedMax || 1;
    const spLabel = scene.add.text(cx, cy + 60, '', { fontSize: '11px', color: speedMax > 1 ? '#80deea' : '#5d4037' }).setOrigin(0.5).setScrollFactor(0);
    const title = scene.add.text(cx, cy + 82, '拠点へ戻る', { fontSize: '11px', color: '#bcaaa4' }).setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });

    const availSpeeds = [1, 1.5, 2].filter((v) => v <= speedMax);
    const refresh = () => {
      qLabel.setText(`エフェクト品質: ${scene.settings.effectQuality}（クリックで変更）`);
      dLabel.setText(`ダメージ数字: ${scene.settings.damageNumbers ? 'ON' : 'OFF'}`);
      sLabel.setText(`画面揺れ: ${scene.settings.screenShake ? 'ON' : 'OFF'}`);
      spLabel.setText(speedMax > 1 ? `速度: ${scene.speedMult || 1}倍（クリックで変更）` : '速度: 1倍（魂炎で解放）');
    };
    refresh();
    const apply = () => { scene.applyEffectSettings(); SaveManager.saveSettings(scene.settings); refresh(); };

    qLabel.on('pointerdown', () => { const i = QUALITIES.indexOf(scene.settings.effectQuality); scene.settings.effectQuality = QUALITIES[(i + 1) % QUALITIES.length]; apply(); });
    dLabel.on('pointerdown', () => { scene.settings.damageNumbers = !scene.settings.damageNumbers; apply(); });
    sLabel.on('pointerdown', () => { scene.settings.screenShake = !scene.settings.screenShake; apply(); });
    if (speedMax > 1) {
      spLabel.setInteractive({ useHandCursor: true });
      spLabel.on('pointerdown', () => {
        const cur = scene.speedMult || 1;
        const i = availSpeeds.indexOf(cur);
        const next = availSpeeds[(i + 1) % availSpeeds.length];
        scene.settings.speed = next; scene.applySpeed(next); SaveManager.saveSettings(scene.settings); refresh();
      });
    }
    resume.on('pointerdown', () => onResume && onResume());
    title.on('pointerdown', () => onTitle && onTitle());

    ui.add([bg, t, resume, qLabel, dLabel, sLabel, spLabel, title]);
    this.container = ui;
    return ui;
  }

  close() {
    if (this.container) { this.container.destroy(); this.container = null; }
  }
}
