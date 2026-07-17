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
      this.add.text(cx, 98, `★ 難易度${r.newlyUnlocked} を解放しました！`, { fontSize: '10px', color: '#a5d6a7' }).setOrigin(0.5, 0);
    }

    // ジョブ経験値（M6-C）: 今回獲得 Job XP・ジョブレベル変化・XPバー・新規解放した到達報酬。
    // 付与自体は BattleManager で確定済み（表示前に付与・演出待ちで失わない）。二重獲得済みなら安全表示。
    let skillY = 122;
    const job = r.job;
    if (job && job.after && job.after.level) {
      const jy = r.newlyUnlocked ? 112 : 100;
      const jb = job.before || {}, ja = job.after || {};
      const lvTxt = (jb.level !== ja.level) ? `Lv.${jb.level} → Lv.${ja.level}` : `Lv.${ja.level}`;
      this.add.text(cx, jy, `${job.displayName || 'ジョブ'} Job ${lvTxt}`, { fontSize: '11px', color: '#ffd54f', fontStyle: 'bold' }).setOrigin(0.5, 0);
      const dm = (job.xp && job.xp.difficultyMult) ? `（難易度 ×${job.xp.difficultyMult}）` : '';
      const capTxt = ja.atCap ? '  ★最大Lv100到達' : `  次まで ${Math.round(ja.xpToNext || 0)}`;
      this.add.text(cx, jy + 14, `獲得 Job XP: +${job.awarded ? job.xpGain : 0}${dm}${capTxt}`, { fontSize: '9px', color: '#ffab40' }).setOrigin(0.5, 0);
      const bw = 220, bx = cx - bw / 2, by = jy + 27;
      this.add.rectangle(bx, by, bw, 5, 0x3e2723).setOrigin(0, 0);
      this.add.rectangle(bx + 1, by + 1, (bw - 2) * Math.max(0, Math.min(1, ja.ratio || 0)), 3, 0x29b6f6).setOrigin(0, 0);
      const ms = job.milestonesUnlocked || [];
      if (ms.length) this.add.text(cx, jy + 35, '新規解放: ' + ms.map((m) => `Lv${m.level} ${m.label}`).join(' / '), { fontSize: '8px', color: '#a5d6a7', align: 'center', wordWrap: { width: GAME_WIDTH - 40 } }).setOrigin(0.5, 0);
      else if (!job.awarded) this.add.text(cx, jy + 35, '（このリザルトのJob XPは獲得済み）', { fontSize: '8px', color: '#8d6e63' }).setOrigin(0.5, 0);
      skillY = jy + 46;
    }

    // スキル別内訳
    this.add.text(40, skillY, '使用スキル / 与ダメージ / 討伐数 / Lv', { fontSize: '9px', color: '#ffab40' });
    const skills = (r.skills || []).slice().sort((a, b) => (b.damage || 0) - (a.damage || 0));
    let y = skillY + 15;
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
