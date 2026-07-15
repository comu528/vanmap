// 拠点画面（Milestone 3）。タイトルと戦闘の間のハブ。
// 残り火・恒久強化・難易度選択・スキル熟練度・累計統計を表示し、戦闘を開始する。
// 将来（M4）に転生画面・実績画面を追加しやすいよう、上部メニュー + 差し替え式コンテンツで構成。

import { GAME_WIDTH, GAME_HEIGHT } from '../config/game-config.js';
import { SaveManager } from '../systems/SaveManager.js';
import { ProgressionManager } from '../systems/ProgressionManager.js';
import { DataManager } from '../systems/DataManager.js';
import { formatTime } from '../utils/time.js';

export class BaseScene extends Phaser.Scene {
  constructor() {
    super('BaseScene');
  }

  create() {
    this.profile = SaveManager.loadProfile();
    this._busy = false;
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0a0608);

    this.add.text(12, 8, '拠点', { fontSize: '16px', color: '#ff5722', fontStyle: 'bold' });
    this.emberText = this.add.text(GAME_WIDTH - 12, 8, '', { fontSize: '12px', color: '#ffab40' }).setOrigin(1, 0);
    this.subText = this.add.text(GAME_WIDTH - 12, 24, '', { fontSize: '9px', color: '#8d6e63' }).setOrigin(1, 0);

    // 上部メニュー（拡張しやすいよう配列駆動。M4 で 転生/実績 を追加予定）
    this.menu = [
      { key: 'home', label: '概要' },
      { key: 'upgrades', label: '恒久強化' },
      { key: 'difficulty', label: '難易度' },
      { key: 'mastery', label: '熟練度' },
    ];
    this.menuTexts = {};
    let mx = 12;
    for (const m of this.menu) {
      const t = this.add.text(mx, 30, m.label, { fontSize: '11px', color: '#ffe0b2', backgroundColor: '#2a1e2e', padding: { x: 6, y: 3 } })
        .setInteractive({ useHandCursor: true });
      t.on('pointerdown', () => this.show(m.key));
      this.menuTexts[m.key] = t;
      mx += t.width + 8;
    }

    // 下部ボタン
    this.startBtn = this.add.text(GAME_WIDTH / 2 - 90, GAME_HEIGHT - 22, '▶ 戦闘開始', {
      fontSize: '13px', color: '#fff', backgroundColor: '#5d2e1a', padding: { x: 10, y: 5 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.startBtn.on('pointerdown', () => this.startBattle());
    const titleBtn = this.add.text(GAME_WIDTH / 2 + 90, GAME_HEIGHT - 22, 'タイトルへ戻る', {
      fontSize: '11px', color: '#bcaaa4', backgroundColor: '#2a1e2e', padding: { x: 8, y: 4 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    titleBtn.on('pointerdown', () => this.scene.start('TitleScene'));

    this.content = this.add.container(0, 0);
    this.show('home');
    this.refreshHeader();
  }

  refresh() {
    this.profile = SaveManager.loadProfile();
    this.refreshHeader();
    this.show(this._panel);
  }

  refreshHeader() {
    this.emberText.setText(`残り火: ${this.profile.embers}  （累計 ${this.profile.lifetimeEmbers}）`);
    this.subText.setText(`選択難易度: ${this.profile.selectedDifficulty}  / 解放最高: ${Math.max(1, this.profile.highestClearedDifficulty + 1 <= this.difficultyCount() ? this.profile.highestClearedDifficulty + 1 : this.difficultyCount())}`);
  }

  difficultyCount() { return ProgressionManager.difficulties().length; }

  show(key) {
    this._panel = key;
    this.content.removeAll(true);
    for (const m of this.menu) this.menuTexts[m.key].setColor(m.key === key ? '#ff5722' : '#ffe0b2');
    if (key === 'home') this.buildHome();
    else if (key === 'upgrades') this.buildUpgrades();
    else if (key === 'difficulty') this.buildDifficulty();
    else if (key === 'mastery') this.buildMastery();
  }

  add2(obj) { this.content.add(obj); return obj; }
  label(x, y, text, opts) { return this.add2(this.add.text(x, y, text, { fontSize: '10px', color: '#ffe0b2', ...opts })); }

  // ---------------- 概要 ----------------
  buildHome() {
    const p = this.profile;
    const up = ProgressionManager.getUpgradeStats(p);
    const bal = DataManager.balance.player;
    const diff = DataManager.getDifficulty(p.selectedDifficulty);

    this.label(16, 52, '基礎能力', { color: '#ffab40' });
    const abilities = [
      `最大HP: ${bal.maxHp + up.maxHpAdd}`,
      `基礎ダメージ: +${Math.round((up.damageMult - 1) * 100)}%`,
      `移動速度: +${Math.round((up.moveSpeedMult - 1) * 100)}%`,
      `経験値獲得: +${Math.round((up.xpMult - 1) * 100)}%`,
      `吸収範囲: +${Math.round((up.pickupMult - 1) * 100)}%`,
      `ダッシュ回復: ${Math.round((1 - up.dashRechargeMult) * 100)}% 短縮`,
      `無敵時間: +${Math.round((up.invulnMult - 1) * 100)}%`,
      `残り火獲得: +${Math.round((up.emberMult - 1) * 100)}%`,
    ];
    abilities.forEach((a, i) => this.label(20, 68 + i * 13, a, { fontSize: '9px' }));

    this.label(330, 52, '累計記録', { color: '#ffab40' });
    const st = p.statistics;
    const stats = [
      `プレイ時間: ${formatTime(st.totalPlayTime)}`,
      `周回数: ${st.totalRuns}（勝 ${st.totalWins} / 敗 ${st.totalDefeats}）`,
      `累計討伐: ${st.totalKills}`,
      `累計ボス討伐: ${st.totalBossKills}`,
      `最高ダメージ: ${Math.round(st.highestDamage)}`,
      `選択中の難易度: ${p.selectedDifficulty}`,
      `解放済み最高難易度: ${Math.max(...p.unlockedDifficulties)}`,
      `難易度倍率(概要): 敵HP×${diff?.enemyHp ?? 1} / 敵攻×${diff?.enemyDamage ?? 1}`,
    ];
    stats.forEach((a, i) => this.label(334, 68 + i * 13, a, { fontSize: '9px' }));

    this.label(16, 190, '「恒久強化」で残り火を使って強くなり、勝利で次の難易度が解放されます。', { fontSize: '9px', color: '#bcaaa4' });
  }

  // ---------------- 恒久強化 ----------------
  buildUpgrades() {
    this.label(16, 52, '恒久強化（クリックで購入）', { color: '#ffab40' });
    const defs = ProgressionManager.upgradeDefs();
    let y = 68;
    for (const def of defs) {
      this.buildUpgradeRow(def, y);
      y += 14;
    }
  }

  buildUpgradeRow(def, y) {
    const p = this.profile;
    const level = ProgressionManager.upgradeLevel(p, def.id);
    const maxed = level >= def.maxLevel;
    const unlocked = ProgressionManager.isUpgradeUnlocked(p, def);
    const cost = ProgressionManager.upgradeCost(def, level);
    const curEff = this.formatEffect(def, level);
    const nextEff = maxed ? '—' : this.formatEffect(def, level + 1);

    this.label(20, y, def.displayName, { fontSize: '9px' });
    this.label(150, y, `Lv ${level}/${def.maxLevel}`, { fontSize: '9px', color: '#80deea' });
    this.label(215, y, `${curEff}→${nextEff}`, { fontSize: '9px', color: '#bcaaa4' });

    if (!unlocked) {
      this.label(360, y, `🔒 難易度${def.unlockCondition.value}クリアで解放`, { fontSize: '9px', color: '#8d6e63' });
      return;
    }
    if (maxed) {
      this.label(360, y, 'MAX', { fontSize: '9px', color: '#a5d6a7' });
      return;
    }
    const canAfford = p.embers >= cost;
    this.label(360, y, `残り火 ${cost}`, { fontSize: '9px', color: canAfford ? '#ffe0b2' : '#8d6e63' });
    const btn = this.add2(this.add.text(445, y - 1, canAfford ? '購入' : '不足', {
      fontSize: '9px', color: canAfford ? '#fff' : '#8d6e63',
      backgroundColor: canAfford ? '#5d2e1a' : '#2a1e2e', padding: { x: 5, y: 1 },
    }));
    if (canAfford) {
      btn.setInteractive({ useHandCursor: true });
      btn.on('pointerdown', () => this.buyUpgrade(def.id));
    }
  }

  buyUpgrade(id) {
    if (this._busy) return;              // 連打による二重購入防止
    this._busy = true;
    const res = ProgressionManager.buy(id); // 内部で最新 profile を読み直して原子的に検証・保存
    this._busy = false;
    if (res.ok) this.effectFlash('#ffd54f');
    this.refresh();
  }

  formatEffect(def, level) {
    const v = ProgressionManager.effectValue(def, level);
    switch (def.effectType) {
      case 'maxHpAdd': return `+${Math.round(v)}HP`;
      case 'dashRechargeMult': return `-${Math.round(v * 100)}%`;
      case 'startSkillLevel': return `+${Math.round(v)}`;
      default: return `+${Math.round(v * 100)}%`;
    }
  }

  effectFlash(color) {
    const f = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0xffffff, 0.12).setDepth(2000);
    this.tweens.add({ targets: f, alpha: 0, duration: 200, onComplete: () => f.destroy() });
  }

  // ---------------- 難易度 ----------------
  buildDifficulty() {
    this.label(16, 52, '難易度選択（クリアで次を解放）', { color: '#ffab40' });
    const diffs = ProgressionManager.difficulties();
    let y = 70;
    for (const d of diffs) {
      const unlocked = ProgressionManager.isDifficultyUnlocked(this.profile, d.id);
      const selected = this.profile.selectedDifficulty === d.id;
      const nameColor = selected ? '#ffd54f' : unlocked ? '#ffe0b2' : '#8d6e63';
      const prefix = selected ? '▶ ' : '  ';
      const t = this.label(20, y, `${prefix}${d.name}${unlocked ? '' : ' 🔒'}`, { fontSize: '10px', color: nameColor });
      this.label(150, y, `敵HP×${d.enemyHp} 敵攻×${d.enemyDamage} 速×${d.enemySpeed} 数×${d.spawnRate}`, { fontSize: '8px', color: '#bcaaa4' });
      this.label(420, y, `ボスHP×${d.bossHp} 残り火×${d.currency}`, { fontSize: '8px', color: '#bcaaa4' });
      if (unlocked && !selected) {
        t.setInteractive({ useHandCursor: true });
        t.on('pointerdown', () => { ProgressionManager.selectDifficulty(d.id); this.refresh(); });
      }
      y += 16;
    }
    this.label(16, y + 6, '未解放の難易度は選択・開始できません。', { fontSize: '9px', color: '#8d6e63' });
  }

  // ---------------- スキル熟練度 ----------------
  buildMastery() {
    this.label(16, 52, 'スキル熟練度（周回をまたいで蓄積）', { color: '#ffab40' });
    const rows = ProgressionManager.masterySummary(this.profile);
    let y = 70;
    for (const m of rows) {
      this.label(20, y, m.name, { fontSize: '10px' });
      this.label(120, y, `熟練 Lv${m.level}`, { fontSize: '9px', color: '#80deea' });
      const prog = m.needExp ? `${Math.round(m.curExp)}/${Math.round(m.needExp)}` : 'MAX';
      this.label(195, y, `次まで ${prog}`, { fontSize: '9px', color: '#bcaaa4' });
      this.label(320, y, `累計Dmg ${Math.round(m.entry.damage)}`, { fontSize: '9px', color: '#ff8a65' });
      this.label(430, y, `討伐 ${m.entry.kills}`, { fontSize: '9px', color: '#a5d6a7' });
      const b = m.bonus;
      this.label(40, y + 11, `ボーナス: ダメージ+${Math.round((b.damageMult - 1) * 100)}% / CD-${Math.round((1 - b.cooldownMult) * 100)}% / 範囲+${Math.round((b.radiusMult - 1) * 100)}%${b.startLevel ? ` / 初期Lv+${b.startLevel}` : ''}`, { fontSize: '8px', color: '#8d6e63' });
      y += 27;
    }
  }

  // ---------------- 戦闘開始 ----------------
  startBattle() {
    const diff = this.profile.selectedDifficulty || 1;
    this.scene.start('BattleScene', { difficulty: diff, resume: null });
  }
}
