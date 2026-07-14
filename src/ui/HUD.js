// 戦闘画面のHUD。HP / 経験値 / レベル / 経過時間 / 討伐数 / 難易度 /
// 所持スキル / ダッシュ残量 / 一時停止・オート移動ボタンを表示する。

import { GAME_WIDTH, GAME_HEIGHT } from '../config/game-config.js';
import { formatTime } from '../utils/time.js';

export class HUD {
  constructor(scene) {
    this.scene = scene;
    const d = scene.add.container(0, 0).setScrollFactor(0).setDepth(1000);
    this.container = d;

    // HPバー
    this.hpBg = scene.add.rectangle(8, 8, 160, 10, 0x3e2723).setOrigin(0, 0).setScrollFactor(0);
    this.hpBar = scene.add.rectangle(9, 9, 158, 8, 0xe53935).setOrigin(0, 0).setScrollFactor(0);
    this.hpText = scene.add.text(10, 8, '', { fontSize: '8px', color: '#fff' }).setScrollFactor(0);

    // 経験値バー
    this.xpBg = scene.add.rectangle(8, 22, 160, 6, 0x263238).setOrigin(0, 0).setScrollFactor(0);
    this.xpBar = scene.add.rectangle(9, 23, 0, 4, 0x29b6f6).setOrigin(0, 0).setScrollFactor(0);

    this.levelText = scene.add.text(176, 8, 'Lv.1', { fontSize: '11px', color: '#ffe0b2' }).setScrollFactor(0);

    // 中央上：時間 / 討伐数 / 難易度
    this.timeText = scene.add.text(GAME_WIDTH / 2, 8, '0:00', { fontSize: '14px', color: '#fff' }).setOrigin(0.5, 0).setScrollFactor(0);
    this.killText = scene.add.text(GAME_WIDTH / 2, 26, '討伐 0', { fontSize: '9px', color: '#ffab40' }).setOrigin(0.5, 0).setScrollFactor(0);
    this.diffText = scene.add.text(GAME_WIDTH - 8, 8, '', { fontSize: '9px', color: '#ff8a65' }).setOrigin(1, 0).setScrollFactor(0);

    // ダッシュ残量
    this.dashText = scene.add.text(8, GAME_HEIGHT - 16, '', { fontSize: '9px', color: '#80deea' }).setScrollFactor(0);

    // スキル一覧
    this.skillText = scene.add.text(8, GAME_HEIGHT - 30, '', { fontSize: '9px', color: '#ffe0b2' }).setScrollFactor(0);

    // 一時停止 / オート移動ボタン
    this.pauseBtn = scene.add.text(GAME_WIDTH - 8, GAME_HEIGHT - 30, '⏸ 停止(Esc)', { fontSize: '10px', color: '#fff', backgroundColor: '#3e2723', padding: { x: 4, y: 2 } })
      .setOrigin(1, 0).setScrollFactor(0).setInteractive({ useHandCursor: true });
    this.autoBtn = scene.add.text(GAME_WIDTH - 8, GAME_HEIGHT - 16, 'オート移動: OFF (Q)', { fontSize: '10px', color: '#fff', backgroundColor: '#3e2723', padding: { x: 4, y: 2 } })
      .setOrigin(1, 0).setScrollFactor(0).setInteractive({ useHandCursor: true });
  }

  onPause(fn) { this.pauseBtn.on('pointerdown', fn); }
  onToggleAuto(fn) { this.autoBtn.on('pointerdown', fn); }

  update(state) {
    const { player, timeSec, kills, difficultyName, autoMove } = state;
    const hpRatio = Math.max(0, player.hp / player.maxHp);
    this.hpBar.width = 158 * hpRatio;
    this.hpText.setText(`${Math.ceil(player.hp)} / ${player.maxHp}`);
    this.xpBar.width = 158 * Math.min(1, player.xp / player.xpToNext);
    this.levelText.setText(`Lv.${player.level}`);
    this.timeText.setText(formatTime(timeSec));
    this.killText.setText(`討伐 ${kills}`);
    this.diffText.setText(difficultyName);
    this.dashText.setText(`ダッシュ: ${'◆'.repeat(player.dashCharges)}${'◇'.repeat(Math.max(0, player.dashMax - player.dashCharges))}`);
    this.autoBtn.setText(`オート移動: ${autoMove ? 'ON' : 'OFF'} (Q)`);
  }

  setSkills(list) {
    // list: [{name, level}]
    this.skillText.setText('所持: ' + list.map((s) => `${s.name}Lv${s.level}`).join('  '));
  }
}
