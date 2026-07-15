// リザルト画面（M3）。勝敗/生存時間/討伐/ボス討伐/最高ダメージ/スキル別内訳に加え、
// 残り火の獲得内訳（生存・討伐・ボス・難易度・勝敗補正）と所持残り火を表示する。
// 残り火の加算・保存は BattleManager→ProgressionManager 側で確定済み（ここでは表示のみ・二重加算しない）。

import { GAME_WIDTH, GAME_HEIGHT } from '../config/game-config.js';
import { formatTime } from '../utils/time.js';

export class ResultScene extends Phaser.Scene {
  constructor() {
    super('ResultScene');
  }

  init(data) {
    this.result = data || {};
    this.ember = data?.ember || {};
  }

  create() {
    const r = this.result;
    const e = this.ember;
    const cx = GAME_WIDTH / 2;
    this.add.rectangle(cx, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0a0608);

    const win = !!r.win;
    this.add.text(cx, 16, win ? '勝利！' : '敗北…', {
      fontSize: '22px', color: win ? '#ffd54f' : '#ff5252', fontStyle: 'bold',
    }).setOrigin(0.5, 0);

    const summary = [
      `生存: ${formatTime(r.timeSec || 0)}`,
      `討伐: ${r.kills || 0}`,
      `ボス: ${r.bossKills || 0}`,
      `最高ダメージ: ${Math.round(r.maxHit || 0)}`,
    ];
    this.add.text(cx, 44, summary.join('   '), { fontSize: '10px', color: '#ffe0b2' }).setOrigin(0.5, 0);

    // 残り火
    this.add.text(cx, 62, `今回獲得 残り火: +${e.total || 0}    所持: ${r.embersTotal || 0}`, {
      fontSize: '12px', color: '#ffab40', fontStyle: 'bold',
    }).setOrigin(0.5, 0);

    // 獲得内訳
    const parts = [
      `生存 ${e.survival || 0}`,
      `討伐 ${e.kills || 0}`,
      `ボス ${e.boss || 0}`,
      `勝利ボーナス ${e.winBonus || 0}`,
      `難易度 ×${(e.difficultyMult || 1).toFixed(2)}`,
      `${win ? '勝利' : '敗北'}補正 ×${(e.winLoseMult || 1).toFixed(2)}`,
    ];
    if ((e.upgradeMult || 1) !== 1) parts.push(`強化 ×${(e.upgradeMult || 1).toFixed(2)}`);
    this.add.text(cx, 80, '内訳: ' + parts.join(' / '), { fontSize: '9px', color: '#bcaaa4', align: 'center', wordWrap: { width: GAME_WIDTH - 40 } }).setOrigin(0.5, 0);

    if (r.newlyUnlocked) {
      this.add.text(cx, 100, `★ 難易度${r.newlyUnlocked} を解放しました！`, { fontSize: '11px', color: '#a5d6a7' }).setOrigin(0.5, 0);
    }

    // スキル別内訳
    this.add.text(40, 122, '使用スキル / 与ダメージ / 討伐数 / Lv', { fontSize: '9px', color: '#ffab40' });
    const skills = (r.skills || []).slice().sort((a, b) => (b.damage || 0) - (a.damage || 0));
    let y = 138;
    if (skills.length === 0) { this.add.text(40, y, '（スキル未使用）', { fontSize: '9px', color: '#8d6e63' }); }
    for (const s of skills) {
      this.add.text(40, y, s.name, { fontSize: '9px', color: '#ffe0b2' });
      this.add.text(240, y, String(Math.round(s.damage || 0)), { fontSize: '9px', color: '#ff8a65' });
      this.add.text(340, y, String(s.kills || 0), { fontSize: '9px', color: '#a5d6a7' });
      this.add.text(420, y, `Lv${s.level || 0}`, { fontSize: '9px', color: '#80deea' });
      y += 13;
    }

    // ボタン
    const retry = this.add.text(cx - 80, GAME_HEIGHT - 26, '再挑戦', {
      fontSize: '13px', color: '#fff', backgroundColor: '#5d2e1a', padding: { x: 10, y: 5 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    const base = this.add.text(cx + 70, GAME_HEIGHT - 26, '拠点へ戻る', {
      fontSize: '13px', color: '#fff', backgroundColor: '#3e2723', padding: { x: 10, y: 5 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    retry.on('pointerover', () => retry.setColor('#ffd54f'));
    retry.on('pointerout', () => retry.setColor('#fff'));
    retry.on('pointerdown', () => this.scene.start('BattleScene', { difficulty: r.difficultyId || 1, resume: null }));

    base.on('pointerover', () => base.setColor('#ffab40'));
    base.on('pointerout', () => base.setColor('#fff'));
    base.on('pointerdown', () => this.scene.start('BaseScene'));

    this.input.keyboard.on('keydown-ENTER', () => this.scene.start('BattleScene', { difficulty: r.difficultyId || 1, resume: null }));
    this.input.keyboard.on('keydown-ESC', () => this.scene.start('BaseScene'));
  }
}
