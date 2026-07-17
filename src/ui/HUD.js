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
    // ジョブ名＋今回適用中のジョブレベル（M6-C）。戦闘レベル(Lv.n)とは別物として区別して表示する。
    this.jobText = scene.add.text(176, 22, '', { fontSize: '8px', color: '#ffab40' }).setScrollFactor(0);

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

    // ボスHPバー（初期は非表示）
    this.bossName = scene.add.text(GAME_WIDTH / 2, 44, '', { fontSize: '9px', color: '#ff8a80' }).setOrigin(0.5, 0).setScrollFactor(0).setVisible(false);
    this.bossBg = scene.add.rectangle(GAME_WIDTH / 2, 56, 280, 8, 0x3e2723).setScrollFactor(0).setVisible(false);
    this.bossBar = scene.add.rectangle(GAME_WIDTH / 2 - 139, 56, 278, 6, 0xff5252).setOrigin(0, 0.5).setScrollFactor(0).setVisible(false);
    // M7-A: ボス氷砕ゲージ（氷術師でボス出現時のみ・HP バー直下）。ボス不在時は非表示。
    this.bossFrostBg = scene.add.rectangle(GAME_WIDTH / 2, 65, 280, 6, 0x14343e).setScrollFactor(0).setVisible(false);
    this.bossFrostBar = scene.add.rectangle(GAME_WIDTH / 2 - 139, 65, 278, 4, 0x4fc3f7).setOrigin(0, 0.5).setScrollFactor(0).setVisible(false);
    this.bossFrostText = scene.add.text(GAME_WIDTH / 2, 71, '', { fontSize: '7px', color: '#9fe8ff' }).setOrigin(0.5, 0).setScrollFactor(0).setVisible(false);
  }

  showBoss(name) {
    this.bossName.setText(name).setVisible(true);
    this.bossBg.setVisible(true);
    this.bossBar.setVisible(true).width = 278;
  }

  updateBoss(ratio) {
    this.bossBar.width = 278 * Math.max(0, Math.min(1, ratio));
  }

  hideBoss() {
    this.bossName.setVisible(false);
    this.bossBg.setVisible(false);
    this.bossBar.setVisible(false);
    this.hideBossFrost();
  }

  // M7-A: ボス氷砕ゲージ表示（現在値/必要値・脆弱中は色変化・break回数）。
  showBossFrost() { this.bossFrostBg.setVisible(true); this.bossFrostBar.setVisible(true); this.bossFrostText.setVisible(true); }
  hideBossFrost() { this.bossFrostBg.setVisible(false); this.bossFrostBar.setVisible(false); this.bossFrostText.setVisible(false); }
  updateBossFrost(gauge, threshold, breaks, vuln) {
    const ratio = threshold > 0 ? Math.max(0, Math.min(1, gauge / threshold)) : 0;
    this.bossFrostBar.width = 278 * ratio;
    this.bossFrostBar.fillColor = vuln ? 0x80deea : 0x4fc3f7;
    this.bossFrostText.setText(vuln ? `氷砕脆弱中！ break${breaks}` : `氷砕 ${Math.round(gauge)}/${Math.round(threshold)}  break${breaks}`);
  }

  setJob(name, level) { this.jobText.setText(`${name} Job Lv.${level}`); }

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
