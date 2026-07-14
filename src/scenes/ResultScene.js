// リザルト画面。勝敗/生存時間/討伐数/ボス討伐数/各スキルの与ダメージ・討伐数/最高ダメージ/
// 再挑戦/タイトルへ戻る を表示する。
// 恒久通貨（残り火）の獲得表示は用意するが、恒久強化への反映は Milestone 3 で行う。

import { GAME_WIDTH, GAME_HEIGHT } from '../config/game-config.js';
import { formatTime } from '../utils/time.js';

export class ResultScene extends Phaser.Scene {
  constructor() {
    super('ResultScene');
  }

  init(data) {
    this.result = data || {};
  }

  create() {
    const r = this.result;
    const cx = GAME_WIDTH / 2;
    this.add.rectangle(cx, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0a0608);

    const win = !!r.win;
    this.add.text(cx, 26, win ? '勝利！' : '敗北…', {
      fontSize: '24px', color: win ? '#ffd54f' : '#ff5252', fontStyle: 'bold',
    }).setOrigin(0.5);

    // 概要
    const summary = [
      `生存時間: ${formatTime(r.timeSec || 0)}`,
      `討伐数: ${r.kills || 0}`,
      `ボス討伐数: ${r.bossKills || 0}`,
      `最高ダメージ: ${Math.round(r.maxHit || 0)}`,
      `獲得残り火: ${r.ember || 0}（拠点反映は M3）`,
    ];
    this.add.text(cx, 58, summary.join('    '), { fontSize: '10px', color: '#ffe0b2', align: 'center' }).setOrigin(0.5, 0);

    // スキル別内訳
    this.add.text(40, 96, '使用スキル / 与ダメージ / 討伐数 / Lv', { fontSize: '10px', color: '#ffab40' });
    const skills = (r.skills || []).slice().sort((a, b) => (b.damage || 0) - (a.damage || 0));
    let y = 114;
    if (skills.length === 0) {
      this.add.text(40, y, '（スキル未使用）', { fontSize: '10px', color: '#8d6e63' });
      y += 16;
    }
    for (const s of skills) {
      this.add.text(40, y, s.name, { fontSize: '10px', color: '#ffe0b2' });
      this.add.text(240, y, String(Math.round(s.damage || 0)), { fontSize: '10px', color: '#ff8a65' });
      this.add.text(340, y, String(s.kills || 0), { fontSize: '10px', color: '#a5d6a7' });
      this.add.text(420, y, `Lv${s.level || 0}`, { fontSize: '10px', color: '#80deea' });
      y += 15;
    }

    // ボタン
    const retry = this.add.text(cx - 70, GAME_HEIGHT - 30, '再挑戦', {
      fontSize: '14px', color: '#fff', backgroundColor: '#5d2e1a', padding: { x: 10, y: 5 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    const title = this.add.text(cx + 70, GAME_HEIGHT - 30, 'タイトルへ', {
      fontSize: '14px', color: '#fff', backgroundColor: '#3e2723', padding: { x: 10, y: 5 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    retry.on('pointerover', () => retry.setColor('#ffd54f'));
    retry.on('pointerout', () => retry.setColor('#fff'));
    retry.on('pointerdown', () => this.scene.start('BattleScene', { difficulty: r.difficultyId || 1, resume: null }));

    title.on('pointerover', () => title.setColor('#ffab40'));
    title.on('pointerout', () => title.setColor('#fff'));
    title.on('pointerdown', () => this.scene.start('TitleScene'));

    this.input.keyboard.on('keydown-ENTER', () => this.scene.start('BattleScene', { difficulty: r.difficultyId || 1, resume: null }));
    this.input.keyboard.on('keydown-ESC', () => this.scene.start('TitleScene'));
  }
}
