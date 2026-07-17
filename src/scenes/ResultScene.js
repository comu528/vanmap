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

    // M6-F: Balance Summary（詳細ボタン）。debugRun（Balance Playtest / F4〜F8 使用）は通常統計へ記録されない旨を明示。
    const bs = r.balanceSummary;
    if (bs && bs.run) {
      if (bs.run.debugRun) {
        this.add.text(cx, skillY - 12, '● 検証周回（debug補正）— 通常バランス統計へ記録していません', { fontSize: '8px', color: '#80cbc4' }).setOrigin(0.5, 0);
      }
      const btn = this.add.text(GAME_WIDTH - 8, skillY, 'Balance詳細 ▸', { fontSize: '9px', color: '#0d1017', backgroundColor: '#80cbc4', padding: { x: 5, y: 1 } }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
      btn.on('pointerdown', () => this.toggleBalanceOverlay(bs));
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

  // M6-F: Balance Summary 詳細オーバーレイ（スキル別 DPS/割合/残響/分身/上限＋周回全体＋防御系）。
  // 640×360 に収めるため上位スキルのみ表示し、全量は JSON エクスポート（データ管理画面）で確認する。
  toggleBalanceOverlay(bs) {
    if (this._bo) { this._bo.destroy(true); this._bo = null; return; }
    const cx = GAME_WIDTH / 2;
    const ui = this.add.container(0, 0).setDepth(5000);
    ui.add(this.add.rectangle(cx, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x05070a, 0.96));
    const run = bs.run || {};
    ui.add(this.add.text(cx, 4, `Balance Summary${run.debugRun ? '（検証周回・通常統計外）' : ''}`, { fontSize: '11px', color: '#80cbc4' }).setOrigin(0.5, 0));
    ui.add(this.add.text(cx, 18, `seed:${run.seed} 難:${run.difficulty} 品質:${run.quality} 速:${run.speed} | FPS平均${Math.round(run.avgFps || 0)} 最低${Math.round(run.minFps || 0)} p95:${Math.round(run.frameP95Ms || 0)}ms cap:${Object.values(run.caps || {}).reduce((a, b) => a + b, 0)}`, { fontSize: '8px', color: '#a5d6a7' }).setOrigin(0.5, 0));
    ui.add(this.add.text(cx, 30, `総ダメージ${Math.round(run.totalDamage || 0)} 撃破${run.totalKills || 0}(精${run.eliteKills || 0}) 被弾${Math.round(run.damageTaken || 0)} 生存${Math.round(run.survivalSeconds || 0)}s 進化${run.evolutions || 0} 枠A${run.activeSlots || 0}/P${run.passiveSlots || 0} R${run.rerolls || 0}`, { fontSize: '8px', color: '#bcaaa4' }).setOrigin(0.5, 0));
    // M7-A: 状態異常（周回全体）。氷術師では冷気/凍結/粉砕/ボス氷砕を表示。
    const st = run.status || {};
    const hasStatus = (run.jobId === 'frost_mage') || st.freezes > 0 || st.shatters > 0 || st.bossFrostbreaks > 0;
    if (hasStatus) ui.add(this.add.text(cx, 41, `ジョブ:${run.jobId || '-'} 氷Dmg${Math.round(st.iceDamage || 0)} 冷気${Math.round(st.chillApplied || 0)} 凍結${st.freezes || 0}/${st.freezeAttempts || 0} 粉砕${st.shatters || 0}(${Math.round(st.shatterDamage || 0)}) 氷砕${st.bossFrostbreaks || 0}`, { fontSize: '8px', color: '#80deea' }).setOrigin(0.5, 0));
    // ヘッダ。
    const cols = [[20, 'スキル'], [120, 'Lv'], [150, 'Dmg'], [210, 'DPS'], [255, '割%'], [290, '発'], [320, '命'], [350, '撃'], [378, '残'], [402, '分'], [426, '上限'], [456, '防御値']];
    ui.add(this.add.text(20, 52, cols.map((c) => c[1]).join('  '), { fontSize: '7px', color: '#ffab40' }));
    const skills = Object.entries(bs.skills || {}).map(([id, s]) => ({ id, ...s })).sort((a, b) => (b.damage || 0) - (a.damage || 0)).slice(0, 20);
    let y = 62;
    for (const s of skills) {
      const row = ui.add(this.add.container(0, 0));
      const put = (x, t, col) => row.add(this.add.text(x, y, String(t), { fontSize: '7px', color: col || '#ffe0b2' }));
      put(20, (s.evolved ? '★' : '') + s.id.slice(0, 16), s.evolved ? '#ffd54f' : '#ffe0b2');
      put(120, s.finalLevel || 0, '#80deea');
      put(150, Math.round(s.damage || 0), '#ff8a65');
      put(210, Math.round(s.estimatedDps || 0), '#ffab40');
      put(255, ((s.damageShare || 0) * 100).toFixed(1), '#bcaaa4');
      put(290, s.casts || 0); put(320, s.hits || 0); put(350, s.kills || 0);
      put(378, s.echoCasts || 0, '#ce93d8'); put(402, s.cloneCasts || 0, '#ce93d8');
      put(426, s.capReachedCount || 0, '#ff5252');
      // 防御スキルはダメージ0だけを出さず defensiveValue（防いだ/回復/吸収/致死回避）を表示。
      put(456, Math.round(s.defensiveValue || 0), '#80cbc4');
      ui.add(row); y += 11;
      if (y > GAME_HEIGHT - 30) break;
    }
    ui.add(this.add.text(cx, GAME_HEIGHT - 20, '全量は データ管理画面 → テレメトリ JSON エクスポート で確認できます', { fontSize: '7px', color: '#8d6e63' }).setOrigin(0.5, 0));
    const close = this.add.text(cx, GAME_HEIGHT - 8, '閉じる', { fontSize: '9px', color: '#bcaaa4' }).setOrigin(0.5, 1).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.toggleBalanceOverlay(bs));
    ui.add(close);
    this._bo = ui;
  }
}
