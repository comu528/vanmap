// 拠点画面（Milestone 4）。概要 / 恒久強化 / 熟練度 / 難易度 / 転生 / 魂炎強化 のタブを持ち、
// 内容はスクロール可能（ホイール / ドラッグ / スクロールバー / キーボード）。
// 恒久強化=ProgressionManager、転生・魂炎=ReincarnationManager を使う。

import { GAME_WIDTH, GAME_HEIGHT } from '../config/game-config.js';
import { SaveManager } from '../systems/SaveManager.js';
import { ProgressionManager } from '../systems/ProgressionManager.js';
import { ReincarnationManager } from '../systems/ReincarnationManager.js';
import { JobProgressionManager } from '../systems/JobProgressionManager.js';
import { JobModifierManager } from '../systems/JobModifierManager.js';
import { DataManager } from '../systems/DataManager.js';
import { formatTime } from '../utils/time.js';
import { buildCatalog as buildSkillCatalog, evolutionRecipes } from '../systems/SkillCatalog.js';
import { registeredSkillIds, skillsWithRuntimeState } from '../systems/SkillManager.js';
import { skillSummaryLine } from '../systems/SkillAudit.js';

const VIEW_TOP = 50;
const VIEW_BOTTOM = GAME_HEIGHT - 34;
const VIEW_H = VIEW_BOTTOM - VIEW_TOP;

export class BaseScene extends Phaser.Scene {
  constructor() { super('BaseScene'); }

  create() {
    this.profile = SaveManager.loadProfile();
    this._busy = false;
    this._overlay = null;
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0a0608);

    this.add.text(12, 6, '拠点', { fontSize: '15px', color: '#ff5722', fontStyle: 'bold' });
    this.emberText = this.add.text(GAME_WIDTH - 12, 5, '', { fontSize: '11px', color: '#ffab40' }).setOrigin(1, 0);
    this.subText = this.add.text(GAME_WIDTH - 12, 20, '', { fontSize: '9px', color: '#8d6e63' }).setOrigin(1, 0);

    this.menu = [
      { key: 'home', label: '概要' },
      { key: 'upgrades', label: '恒久強化' },
      { key: 'mastery', label: '熟練度' },
      { key: 'job', label: 'ジョブ育成' },
      { key: 'difficulty', label: '難易度' },
      { key: 'reincarnation', label: '転生' },
      { key: 'soulflame', label: '魂炎強化' },
      { key: 'catalog', label: 'カタログ' },
    ];
    this.menuTexts = {};
    let mx = 12;
    for (const m of this.menu) {
      const t = this.add.text(mx, 32, m.label, { fontSize: '10px', color: '#ffe0b2', backgroundColor: '#2a1e2e', padding: { x: 5, y: 2 } })
        .setInteractive({ useHandCursor: true });
      t.on('pointerdown', () => this.show(m.key));
      this.menuTexts[m.key] = t;
      mx += t.width + 6;
    }

    // 下部ボタン
    this.startBtn = this.add.text(GAME_WIDTH / 2 - 90, GAME_HEIGHT - 16, '▶ 戦闘開始', {
      fontSize: '12px', color: '#fff', backgroundColor: '#5d2e1a', padding: { x: 9, y: 4 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.startBtn.on('pointerdown', () => this.startBattle());
    const titleBtn = this.add.text(GAME_WIDTH / 2 + 82, GAME_HEIGHT - 16, 'タイトルへ', {
      fontSize: '10px', color: '#bcaaa4', backgroundColor: '#2a1e2e', padding: { x: 7, y: 3 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    titleBtn.on('pointerdown', () => this.scene.start('TitleScene'));

    const dataBtn = this.add.text(GAME_WIDTH - 8, GAME_HEIGHT - 16, '💾 データ管理', {
      fontSize: '9px', color: '#80deea', backgroundColor: '#1a2a2e', padding: { x: 6, y: 3 },
    }).setOrigin(1, 0.5).setInteractive({ useHandCursor: true });
    dataBtn.on('pointerdown', () => this.scene.start('DataManagementScene', { from: 'BaseScene' }));

    // スクロール領域
    this.content = this.add.container(0, 0);
    const maskG = this.make.graphics();
    maskG.fillRect(0, VIEW_TOP, GAME_WIDTH, VIEW_H);
    this.content.setMask(maskG.createGeometryMask());
    this.scrollY = 0; this._maxY = 0;
    this.scrollbar = this.add.rectangle(GAME_WIDTH - 4, VIEW_TOP, 4, 20, 0x5d4037).setOrigin(0.5, 0).setDepth(500);

    this._setupScrollInput();
    this.show('home');
    this.refreshHeader();

    // デバッグ確認機能（?debug=1 のときのみ）
    if (window.RFS_DEBUG) {
      this._dbgBtn = this.add.text(GAME_WIDTH / 2 - 6, 6, '⚙debug', { fontSize: '9px', color: '#80deea', backgroundColor: '#1a2a2e', padding: { x: 4, y: 2 } })
        .setOrigin(0.5, 0).setInteractive({ useHandCursor: true });
      this._dbgBtn.on('pointerdown', () => this.toggleDebug());
      this.input.keyboard.on('keydown-F1', () => this.toggleDebug());
    }
  }

  _setupScrollInput() {
    this.input.on('wheel', (p, o, dx, dy) => { if (!this._overlay) this.setScroll(this.scrollY + dy * 0.4); });
    let dragging = false, lastY = 0;
    this.input.on('pointerdown', (p) => { if (!this._overlay && p.y > VIEW_TOP && p.y < VIEW_BOTTOM) { dragging = true; lastY = p.y; } });
    this.input.on('pointerup', () => { dragging = false; });
    this.input.on('pointermove', (p) => { if (dragging && p.isDown) { this.setScroll(this.scrollY - (p.y - lastY)); lastY = p.y; } });
    this.input.keyboard.on('keydown-DOWN', () => this.setScroll(this.scrollY + 20));
    this.input.keyboard.on('keydown-UP', () => this.setScroll(this.scrollY - 20));
    this.input.keyboard.on('keydown-PAGE_DOWN', () => this.setScroll(this.scrollY + VIEW_H));
    this.input.keyboard.on('keydown-PAGE_UP', () => this.setScroll(this.scrollY - VIEW_H));
  }

  contentHeight() { return Math.max(0, this._maxY - VIEW_TOP + 8); }
  maxScroll() { return Math.max(0, this.contentHeight() - VIEW_H); }

  setScroll(y) {
    this.scrollY = Phaser.Math.Clamp(y, 0, this.maxScroll());
    this.content.y = -this.scrollY;
    this._updateScrollbar();
  }

  _updateScrollbar() {
    const max = this.maxScroll();
    if (max <= 0) { this.scrollbar.setVisible(false); return; }
    this.scrollbar.setVisible(true);
    const th = Math.max(16, VIEW_H * (VIEW_H / this.contentHeight()));
    const t = this.scrollY / max;
    this.scrollbar.height = th;
    this.scrollbar.y = VIEW_TOP + t * (VIEW_H - th);
  }

  refresh() { this.profile = SaveManager.loadProfile(); this.refreshHeader(); this.show(this._panel); }

  refreshHeader() {
    const p = this.profile;
    this.emberText.setText(`残り火 ${p.embers}（累計 ${p.lifetimeEmbers}）  魂炎 ${p.soulflame}`);
    this.subText.setText(`転生 ${p.reincarnationCount}回 / 選択難易度 ${p.selectedDifficulty} / 解放 ${Math.max(...p.unlockedDifficulties)}`);
  }

  show(key) {
    this._panel = key;
    this.content.removeAll(true);
    this._maxY = VIEW_TOP;
    for (const m of this.menu) this.menuTexts[m.key].setColor(m.key === key ? '#ff5722' : '#ffe0b2');
    if (key === 'home') this.buildHome();
    else if (key === 'upgrades') this.buildUpgrades();
    else if (key === 'mastery') this.buildMastery();
    else if (key === 'job') this.buildJob();
    else if (key === 'difficulty') this.buildDifficulty();
    else if (key === 'reincarnation') this.buildReincarnation();
    else if (key === 'soulflame') this.buildSoulflame();
    else if (key === 'catalog') this.buildCatalogTab();
    this.setScroll(0);
  }

  // ---------------- スキルカタログ（M6-F・開発/確認用・実データ由来） ----------------
  // 会話や手書きではなく data から正確に生成する。進化あり/なし・進化レシピ・残響/分身/Lv80/タグを一覧表示。
  // SkillCatalog と SkillAudit を共有し UI 専用の別判定を作らない。未発見を隠す図鑑機能ではない。
  buildCatalogTab() {
    const cat = buildSkillCatalog({
      skills: DataManager.skills, passives: DataManager.passives, evolutions: DataManager.evolutions,
      jobs: DataManager.jobs, jobId: this.profile.selectedJobId || 'flame_witch',
      registeredIds: registeredSkillIds(), runtimeStateIds: skillsWithRuntimeState(),
    });
    const s = cat.summary;
    const RC = { common: '#bcaaa4', uncommon: '#80deea', rare: '#ce93d8', legendary: '#ffd54f' };
    this.label(16, 54, `火の魔女カタログ  active${s.activeCount} / 進化${s.evolutionCount} / passive${s.passiveCount}`, { color: '#ffab40' });
    this.label(16, 66, `レアリティ active: C${s.rarityActives.common} U${s.rarityActives.uncommon} R${s.rarityActives.rare} L${s.rarityActives.legendary}  役割: ${Object.entries(s.roleDist).map(([k, v]) => k + v).join(' ')}`, { fontSize: '8px', color: '#bcaaa4' });
    if (cat.issues.length) this.label(16, 76, `⚠ データ不整合 ${cat.issues.length}件`, { fontSize: '8px', color: '#ff5252' });
    else this.label(16, 76, '✓ データ不整合なし（孤立/未登録/参照ズレ 0）', { fontSize: '8px', color: '#a5d6a7' });

    let y = 92;
    this.label(16, y, '── active30種（★=進化あり） ──', { fontSize: '9px', color: '#ffab40' }); y += 13;
    const acts = cat.actives.slice().sort((a, b) => (RC[a.rarity] ? 0 : 0) || (a.hasEvolution === b.hasEvolution ? (a.id < b.id ? -1 : 1) : (a.hasEvolution ? -1 : 1)));
    for (const a of acts) {
      this.label(20, y, `${a.hasEvolution ? '★' : '・'}${a.displayName}`, { fontSize: '8px', color: RC[a.rarity] || '#ffe0b2' });
      this.label(150, y, `${a.rarity}`, { fontSize: '7px', color: RC[a.rarity] || '#bcaaa4' });
      const def = DataManager.getSkill(a.id);
      const evo = a.hasEvolution ? DataManager.getEvolution(a.evolutions[0]) : null;
      this.label(210, y, skillSummaryLine(def, evo), { fontSize: '7px', color: '#80cbc4', wordWrap: { width: 410 } });
      y += 12;
    }

    y += 6;
    this.label(16, y, '── 進化レシピ18種（基礎Lv8 ＋ 補助条件） ──', { fontSize: '9px', color: '#ffab40' }); y += 13;
    const recipes = evolutionRecipes(cat);
    for (const r of recipes) {
      const aux = [...r.auxActive.map((x) => `${x.skill}Lv${x.level}`), ...r.auxPassive.map((x) => `${x.skill}Lv${x.level}(P)`)].join(' + ') || '（補助なし）';
      const tag = [r.needsLegendaryCondition ? 'L条件' : '', r.needsDefensiveCondition ? '防御条件' : '', `枠A${r.minActiveSkills}/P${r.minPassiveSkills}`].filter(Boolean).join(' ');
      this.label(20, y, `${r.displayName}`, { fontSize: '8px', color: '#ffd54f' });
      this.label(150, y, `← ${r.baseSkillId}Lv8 ＋ ${aux}`, { fontSize: '7px', color: '#a5d6a7', wordWrap: { width: 340 } });
      this.label(560, y, tag, { fontSize: '7px', color: '#8d6e63' });
      y += (aux.length > 46 ? 20 : 12);
    }

    y += 6;
    this.label(16, y, `── 進化なし active（${s.withoutEvolution.length}） ──`, { fontSize: '9px', color: '#ffab40' }); y += 13;
    this.label(20, y, s.withoutEvolution.join(', '), { fontSize: '8px', color: '#bcaaa4', wordWrap: { width: 600 } }); y += 24;
    this.label(16, y, 'Lv80発射数+1対象: ' + s.lv80Targets.join(', '), { fontSize: '7px', color: '#80cbc4', wordWrap: { width: 600 } });
  }

  add2(obj) { this.content.add(obj); if (obj.y + 12 > this._maxY) this._maxY = obj.y + 12; return obj; }
  label(x, y, text, opts) { return this.add2(this.add.text(x, y, text, { fontSize: '10px', color: '#ffe0b2', ...opts })); }

  // ---------------- 概要 ----------------
  buildHome() {
    const p = this.profile;
    const up = ProgressionManager.getUpgradeStats(p);
    const reinc = ReincarnationManager.getReincarnationStats(p);
    const bal = DataManager.balance.player;
    const diff = DataManager.getDifficulty(p.selectedDifficulty);

    this.label(16, 54, '基礎能力', { color: '#ffab40' });
    const abilities = [
      `最大HP: ${bal.maxHp + up.maxHpAdd}`,
      `基礎ダメージ: +${Math.round((up.damageMult * reinc.startDamageMult - 1) * 100)}%（転生 +${Math.round((reinc.startDamageMult - 1) * 100)}%含む）`,
      `移動速度: +${Math.round((up.moveSpeedMult - 1) * 100)}%`,
      `経験値獲得: +${Math.round((up.xpMult - 1) * 100)}%`,
      `吸収範囲: +${Math.round((up.pickupMult - 1) * 100)}%`,
      `ダッシュ回復: ${Math.round((1 - up.dashRechargeMult) * 100)}% 短縮`,
      `残り火獲得: +${Math.round((up.emberMult - 1) * 100)}%`,
      `レベルアップ候補: ${3 + reinc.levelUpChoices}択  / 倍速上限: ${reinc.speedMax}倍`,
      `オートダッシュ: ${reinc.autoDash ? 'ON' : '未解放'}`,
    ];
    abilities.forEach((a, i) => this.label(20, 70 + i * 13, a, { fontSize: '9px' }));

    this.label(330, 54, '累計記録', { color: '#ffab40' });
    const st = p.statistics;
    const stats = [
      `プレイ時間: ${formatTime(st.totalPlayTime)}`,
      `周回数: ${st.totalRuns}（勝 ${st.totalWins} / 敗 ${st.totalDefeats}）`,
      `累計討伐: ${st.totalKills}`,
      `累計ボス討伐: ${st.totalBossKills}`,
      `最高ダメージ: ${Math.round(st.highestDamage)}`,
      `過去最高難易度: ${p.highestEverDifficulty}`,
      `転生回数: ${p.reincarnationCount} / 魂炎累計 ${p.lifetimeSoulflame}`,
      `難易度倍率: 敵HP×${diff?.enemyHp ?? 1} 敵攻×${diff?.enemyDamage ?? 1}`,
    ];
    stats.forEach((a, i) => this.label(334, 70 + i * 13, a, { fontSize: '9px' }));

    this.label(16, 196, '恒久強化で強くなり難易度を解放。条件を満たすと転生し、魂炎でゲーム規模を拡張します。', { fontSize: '9px', color: '#bcaaa4' });
  }

  // ---------------- 恒久強化 ----------------
  buildUpgrades() {
    this.label(16, 54, '恒久強化（残り火／クリックで購入）', { color: '#ffab40' });
    let y = 70;
    for (const def of ProgressionManager.upgradeDefs()) { this.buildUpgradeRow(def, y); y += 15; }
  }

  buildUpgradeRow(def, y) {
    const p = this.profile;
    const level = ProgressionManager.upgradeLevel(p, def.id);
    const maxLevel = ProgressionManager.effectiveMaxLevel(def, p);
    const maxed = level >= maxLevel;
    const unlocked = ProgressionManager.isUpgradeUnlocked(p, def);
    const cost = ProgressionManager.upgradeCost(def, level);

    this.label(20, y, def.displayName, { fontSize: '9px' });
    this.label(150, y, `Lv ${level}/${maxLevel}`, { fontSize: '9px', color: '#80deea' });
    this.label(215, y, `${this.formatUpEffect(def, level)}→${maxed ? '—' : this.formatUpEffect(def, level + 1)}`, { fontSize: '9px', color: '#bcaaa4' });
    if (!unlocked) { this.label(360, y, `🔒 難易度${def.unlockCondition.value}クリアで解放`, { fontSize: '9px', color: '#8d6e63' }); return; }
    if (maxed) { this.label(360, y, 'MAX', { fontSize: '9px', color: '#a5d6a7' }); return; }
    const can = p.embers >= cost;
    this.label(360, y, `残り火 ${cost}`, { fontSize: '9px', color: can ? '#ffe0b2' : '#8d6e63' });
    const btn = this.add2(this.add.text(440, y - 1, can ? '購入' : '不足', { fontSize: '9px', color: can ? '#fff' : '#8d6e63', backgroundColor: can ? '#5d2e1a' : '#2a1e2e', padding: { x: 5, y: 1 } }));
    if (can) { btn.setInteractive({ useHandCursor: true }); btn.on('pointerdown', () => this.buy(() => ProgressionManager.buy(def.id))); }
  }

  formatUpEffect(def, level) {
    const v = ProgressionManager.effectValue(def, level);
    switch (def.effectType) {
      case 'maxHpAdd': return `+${Math.round(v)}HP`;
      case 'dashRechargeMult': return `-${Math.round(v * 100)}%`;
      case 'startSkillLevel': return `+${Math.round(v)}`;
      default: return `+${Math.round(v * 100)}%`;
    }
  }

  buy(fn) {
    if (this._busy) return;
    this._busy = true;
    const res = fn();
    this._busy = false;
    if (res.ok) this.flash();
    this.refresh();
  }

  flash() {
    const f = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0xffffff, 0.1).setDepth(2000);
    this.tweens.add({ targets: f, alpha: 0, duration: 180, onComplete: () => f.destroy() });
  }

  // ---------------- 熟練度 ----------------
  buildMastery() {
    this.label(16, 54, 'スキル熟練度（周回をまたいで蓄積 / 進化と連携）', { color: '#ffab40' });
    let y = 70;
    for (const m of ProgressionManager.masterySummary(this.profile)) {
      this.label(20, y, m.name, { fontSize: '10px' });
      this.label(120, y, `熟練 Lv${m.level}`, { fontSize: '9px', color: '#80deea' });
      this.label(190, y, m.needExp ? `次 ${Math.round(m.curExp)}/${Math.round(m.needExp)}` : 'MAX', { fontSize: '9px', color: '#bcaaa4' });
      this.label(300, y, `累計Dmg ${Math.round(m.entry.damage)}`, { fontSize: '9px', color: '#ff8a65' });
      this.label(410, y, `進化 ${m.entry.evolutions || 0}回`, { fontSize: '9px', color: '#ffd54f' });
      const b = m.bonus;
      this.label(40, y + 11, `ボーナス Dmg+${Math.round((b.damageMult - 1) * 100)}% CD-${Math.round((1 - b.cooldownMult) * 100)}% 範囲+${Math.round((b.radiusMult - 1) * 100)}%${b.startLevel ? ` 初期Lv+${b.startLevel}` : ''}  Lv5:候補率↑ Lv10:初期Lv2 Lv15:進化条件緩和 Lv20:進化強化`, { fontSize: '7px', color: '#8d6e63' });
      y += 27;
    }
  }

  // ---------------- ジョブ育成（M6-C） ----------------
  // 戦闘レベル（周回ごとにLv1・経験値ジェムで上昇・周回終了でリセット）とは別の、恒久的なジョブレベルを表示する。
  // 今回は火の魔女1ジョブのみ。他ジョブ選択画面は実装しない。
  buildJob() {
    const p = this.profile;
    const jobId = p.selectedJobId || 'flame_witch';
    const jdef = DataManager.getJob(jobId);
    const jp = DataManager.getJobProgression(jobId);
    const entry = (p.jobProgress && p.jobProgress[jobId]) || JobProgressionManager.emptyEntry();
    const prog = JobProgressionManager.progress(jobId, entry.totalXp || 0);
    const mods = JobModifierManager.resolve(jp, prog.level);

    // ヘッダ: 仮アイコン（既存生成テクスチャ）＋ジョブ名＋Lv
    this.add2(this.add.image(30, 68, 'icon_fireball').setScale(1.5));
    this.label(46, 54, `${jdef?.displayName || jobId}`, { color: '#ffd54f', fontSize: '12px' });
    this.label(46, 70, `Job Lv.${prog.level} / ${prog.cap}`, { fontSize: '10px', color: '#80deea' });

    // XPバー（戦闘レベルとは別物）
    this.label(210, 54, `Job XP（累計）: ${Math.round(prog.totalXp)}`, { fontSize: '9px', color: '#ffab40' });
    this.label(210, 68, prog.atCap ? '最大Lv100 到達' : `次のLvまで ${Math.round(prog.xpToNext)}（${Math.round(prog.xpIntoLevel)}/${Math.round(prog.xpForNext)}）`, { fontSize: '9px', color: '#bcaaa4' });
    const bx = 210, by = 82, bw = 250;
    this.add2(this.add.rectangle(bx, by, bw, 6, 0x3e2723).setOrigin(0, 0));
    this.add2(this.add.rectangle(bx + 1, by + 1, (bw - 2) * prog.ratio, 4, 0x29b6f6).setOrigin(0, 0));

    // 統計
    this.label(20, 96, `出撃 ${entry.runs || 0}（勝 ${entry.wins || 0} / 敗 ${entry.losses || 0}）  最高難易度クリア ${entry.highestDifficultyCleared || 0}  進化 ${entry.totalEvolutions || 0}回`, { fontSize: '9px', color: '#bcaaa4' });

    // 現在の基本補正
    this.label(16, 112, '現在の基本補正（火の魔女を使用している周回のみ有効）', { color: '#ffab40', fontSize: '10px' });
    const pct = (m) => `${Math.round((m - 1) * 1000) / 10}%`;
    const cd = Math.round((1 - mods.cooldownMult()) * 1000) / 10;
    this.label(24, 126, `火ダメージ +${pct(mods.damageMultiplier({ element: 'fire' }))}  /  DoT追加 +${pct(mods.dotDamageMult)}  /  火範囲 +${pct(mods.fireAreaMult())}${cd ? `  /  CD -${cd}%` : ''}`, { fontSize: '8px' });

    // 次の到達報酬
    const next = JobProgressionManager.nextMilestone(jobId, prog.level);
    this.label(16, 142, next ? `次の到達報酬: Lv${next.level} ${next.label} — ${next.description}` : '到達報酬: すべて解放済み', { color: '#a5d6a7', fontSize: '9px', wordWrap: { width: 470 } });

    // 到達報酬一覧（解放済み／未解放）
    this.label(16, 160, '到達報酬（Lv5〜Lv100）', { color: '#ffab40', fontSize: '10px' });
    let y = 176;
    for (const m of JobProgressionManager.milestones(jobId)) {
      const unlocked = prog.level >= m.level;
      this.label(24, y, `Lv${m.level}`, { fontSize: '9px', color: unlocked ? '#a5d6a7' : '#8d6e63' });
      this.label(66, y, `${m.label}`, { fontSize: '9px', color: unlocked ? '#ffe0b2' : '#8d6e63' });
      this.label(168, y, m.description, { fontSize: '8px', color: unlocked ? '#bcaaa4' : '#6d5b52', wordWrap: { width: 290 } });
      this.label(474, y, unlocked ? '解放' : '🔒', { fontSize: '8px', color: unlocked ? '#a5d6a7' : '#8d6e63' });
      y += 16;
    }
    this.label(16, y + 6, 'ジョブレベルは周回終了時の Job XP で上昇し、周回・転生をまたいで維持されます。効果は火の魔女を使用中の周回のみ有効です。', { fontSize: '8px', color: '#8d6e63', wordWrap: { width: 480 } });
  }

  // ---------------- 難易度 ----------------
  buildDifficulty() {
    this.label(16, 54, '難易度選択（クリアで次を解放）', { color: '#ffab40' });
    let y = 70;
    for (const d of ProgressionManager.difficulties()) {
      const unlocked = ProgressionManager.isDifficultyUnlocked(this.profile, d.id);
      const selected = this.profile.selectedDifficulty === d.id;
      const t = this.label(20, y, `${selected ? '▶ ' : '  '}${d.name}${unlocked ? '' : ' 🔒'}`, { fontSize: '10px', color: selected ? '#ffd54f' : unlocked ? '#ffe0b2' : '#8d6e63' });
      this.label(150, y, `敵HP×${d.enemyHp} 敵攻×${d.enemyDamage} 速×${d.enemySpeed} 数×${d.spawnRate}`, { fontSize: '8px', color: '#bcaaa4' });
      this.label(420, y, `ボスHP×${d.bossHp} 残り火×${d.currency}`, { fontSize: '8px', color: '#bcaaa4' });
      if (unlocked && !selected) { t.setInteractive({ useHandCursor: true }); t.on('pointerdown', () => { ProgressionManager.selectDifficulty(d.id); this.refresh(); }); }
      y += 16;
    }
    this.label(16, y + 6, '未解放の難易度は選択・開始できません。', { fontSize: '9px', color: '#8d6e63' });
  }

  // ---------------- 転生 ----------------
  buildReincarnation() {
    const p = this.profile;
    const prev = ReincarnationManager.preview(p);
    this.label(16, 54, '転生（周回をリセットして魂炎を得る長期成長）', { color: '#ffd54f' });
    this.label(20, 70, `魂炎: ${p.soulflame}（累計 ${p.lifetimeSoulflame}）  転生回数: ${p.reincarnationCount}`, { fontSize: '10px', color: '#ffab40' });

    const up = ReincarnationManager.unlockProgress(p);
    if (!prev.canReincarnate) {
      this.label(20, 88, '転生条件（いずれか）:', { fontSize: '9px', color: '#ff8a80' });
      this.label(30, 100, `・難易度${up.clearDifficulty}クリア（現在 最高クリア ${up.curDifficulty}）${up.byDifficulty ? ' ✓' : ''}`, { fontSize: '9px' });
      this.label(30, 112, `・累計残り火 ${up.totalEmber}（現在 ${up.curEmber}）${up.byEmber ? ' ✓' : ''}`, { fontSize: '9px' });
    } else {
      this.label(20, 88, `条件達成！今転生すると 魂炎 +${prev.soulflame.total} を獲得`, { fontSize: '10px', color: '#a5d6a7' });
      const b = prev.soulflame;
      this.label(30, 100, `内訳: 残り火 ${b.emberTerm} / 難易度 ${b.diffTerm} / ボス ${b.bossTerm} / 転生 ${b.reincTerm} / 熟練 ${b.masteryTerm}`, { fontSize: '8px', color: '#bcaaa4' });
    }

    this.label(20, 130, 'リセットされるもの:', { fontSize: '9px', color: '#ff8a80' });
    this.label(30, 142, '所持残り火 / 恒久強化 / 選択難易度 / 解放難易度(開始へ) / 今周回のクリア進捗', { fontSize: '8px', color: '#bcaaa4' });
    this.label(20, 158, '維持されるもの:', { fontSize: '9px', color: '#a5d6a7' });
    this.label(30, 170, '転生回数 / 魂炎 / 魂炎強化 / 熟練度累計 / 統計 / 過去最高難易度 / 設定', { fontSize: '8px', color: '#bcaaa4' });
    if (prev.hasActiveRun) this.label(20, 186, '⚠ 途中戦闘データは転生時に削除されます。', { fontSize: '9px', color: '#ff8a80' });

    const enabled = prev.canReincarnate;
    const btn = this.add2(this.add.text(GAME_WIDTH / 2, 208, enabled ? '転生する…' : '転生（条件未達）', {
      fontSize: '12px', color: enabled ? '#fff' : '#8d6e63', backgroundColor: enabled ? '#7a2e1a' : '#2a1e2e', padding: { x: 12, y: 5 },
    }).setOrigin(0.5));
    if (enabled) { btn.setInteractive({ useHandCursor: true }); btn.on('pointerdown', () => this.showReincarnationConfirm(prev)); }
  }

  showReincarnationConfirm(prev) {
    if (this._overlay) return;
    const cx = GAME_WIDTH / 2, cy = GAME_HEIGHT / 2;
    const ui = this.add.container(0, 0).setDepth(3000);
    ui.add(this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.85));
    ui.add(this.add.text(cx, 40, '転生の確認', { fontSize: '18px', color: '#ffd54f', fontStyle: 'bold' }).setOrigin(0.5));
    ui.add(this.add.text(cx, 74, `獲得魂炎: +${prev.soulflame.total}   （これが ${prev.reincarnationCount + 1} 回目の転生）`, { fontSize: '11px', color: '#ffab40' }).setOrigin(0.5));
    ui.add(this.add.text(cx, 100, 'リセット: 残り火 / 恒久強化 / 選択難易度 / 解放難易度 / 今周回のクリア進捗', { fontSize: '9px', color: '#ff8a80', align: 'center', wordWrap: { width: 520 } }).setOrigin(0.5));
    ui.add(this.add.text(cx, 122, '維持: 転生回数 / 魂炎 / 魂炎強化 / 熟練度累計 / 統計 / 過去最高難易度 / 設定', { fontSize: '9px', color: '#a5d6a7', align: 'center', wordWrap: { width: 520 } }).setOrigin(0.5));
    ui.add(this.add.text(cx, 150, '⚠ この操作は取り消せません。途中戦闘データがある場合は削除されます。', { fontSize: '9px', color: '#ff8a80', align: 'center', wordWrap: { width: 520 } }).setOrigin(0.5));

    const cancel = this.add.text(cx - 90, GAME_HEIGHT - 40, 'キャンセル', { fontSize: '12px', color: '#fff', backgroundColor: '#3e2723', padding: { x: 10, y: 5 } }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    const confirm = this.add.text(cx + 90, GAME_HEIGHT - 40, '最終確認：転生する', { fontSize: '12px', color: '#fff', backgroundColor: '#7a2e1a', padding: { x: 10, y: 5 } }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    cancel.on('pointerdown', () => this.closeOverlay());
    confirm.on('pointerdown', () => this.doReincarnate());
    ui.add([cancel, confirm]);
    this._overlay = ui;
  }

  doReincarnate() {
    if (this._busy) return;
    this._busy = true;
    const res = ReincarnationManager.reincarnate();
    this._busy = false;
    this.closeOverlay();
    if (res.ok) {
      this.flash();
      this.showToast(`転生しました！ 魂炎 +${res.gained}`);
    }
    this.refresh();
    this.show('soulflame');
  }

  showToast(msg) {
    const t = this.add.text(GAME_WIDTH / 2, VIEW_TOP + 10, msg, { fontSize: '11px', color: '#fff', backgroundColor: '#5d2e1a', padding: { x: 8, y: 4 } }).setOrigin(0.5).setDepth(2500);
    this.tweens.add({ targets: t, alpha: 0, delay: 2000, duration: 700, onComplete: () => t.destroy() });
  }

  closeOverlay() { if (this._overlay) { this._overlay.destroy(true); this._overlay = null; } }

  // ---------------- 魂炎強化 ----------------
  buildSoulflame() {
    this.label(16, 54, '魂炎強化（魂炎／転生を重ねてゲーム規模を拡張）', { color: '#ffd54f' });
    this.label(20, 70, `魂炎: ${this.profile.soulflame}`, { fontSize: '10px', color: '#ffab40' });
    let y = 88;
    for (const node of ReincarnationManager.nodes()) { this.buildSoulflameRow(node, y); y += 22; }
  }

  buildSoulflameRow(node, y) {
    const p = this.profile;
    const level = ReincarnationManager.upgradeLevel(p, node.id);
    const maxed = level >= node.maxLevel;
    const prereqOk = ReincarnationManager.prereqMet(p, node);
    const cost = ReincarnationManager.cost(node, level);

    this.label(20, y, node.displayName, { fontSize: '10px', color: '#ffe0b2' });
    this.label(150, y, `Lv ${level}/${node.maxLevel}`, { fontSize: '9px', color: '#80deea' });
    this.label(210, y, this.formatNodeEffect(node, level, maxed), { fontSize: '9px', color: '#bcaaa4' });
    this.label(30, y + 11, node.description, { fontSize: '7px', color: '#8d6e63', wordWrap: { width: 420 } });

    if (!prereqOk) { this.label(360, y, `🔒 前提「${this.nodeName(node.prerequisite)}」`, { fontSize: '9px', color: '#8d6e63' }); return; }
    if (maxed) { this.label(360, y, 'MAX', { fontSize: '9px', color: '#a5d6a7' }); return; }
    const can = p.soulflame >= cost;
    this.label(360, y, `魂炎 ${cost}`, { fontSize: '9px', color: can ? '#ffe0b2' : '#8d6e63' });
    const btn = this.add2(this.add.text(440, y - 1, can ? '購入' : '不足', { fontSize: '9px', color: can ? '#fff' : '#8d6e63', backgroundColor: can ? '#7a2e1a' : '#2a1e2e', padding: { x: 5, y: 1 } }));
    if (can) { btn.setInteractive({ useHandCursor: true }); btn.on('pointerdown', () => this.buy(() => ReincarnationManager.buy(node.id))); }
  }

  nodeName(id) { return ReincarnationManager.getNode(id)?.displayName || id; }

  formatNodeEffect(node, level, maxed) {
    const cur = ReincarnationManager.effectValue(node, level);
    const nxt = maxed ? null : ReincarnationManager.effectValue(node, level + 1);
    const f = (v) => {
      switch (node.effectType) {
        case 'levelUpChoices': return `候補+${v}`;
        case 'startDamageMult': return `火力+${Math.round(v * 100)}%`;
        case 'startSkillLevel': return `初期Lv+${v}`;
        case 'chainCount': return `連鎖+${v}`;
        case 'enemyDensity': return `敵+${v}`;
        case 'effectCap': return `弾+${v}`;
        case 'permCap': return `上限+${v}`;
        case 'speedMode': return `速度${DataManager.speedModes[Math.min(v, DataManager.speedModes.length - 1)]}倍`;
        case 'autoDash': return v >= 1 ? '解放' : '—';
        case 'startEmber': return `残り火${v}`;
        case 'activeSlots': return `アクティブ枠+${v}`;
        default: return `${v}`;
      }
    };
    return maxed ? f(cur) : `${f(cur)}→${f(nxt)}`;
  }

  // ---------------- デバッグ確認（?debug=1） ----------------
  toggleDebug() {
    if (this._dbg) { this._dbg.destroy(true); this._dbg = null; return; }
    const ui = this.add.container(0, 0).setDepth(4000);
    ui.add(this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 300, 210, 0x101820, 0.96).setStrokeStyle(1, 0x80deea));
    ui.add(this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 96, 'DEBUG（拠点）', { fontSize: '11px', color: '#80deea' }).setOrigin(0.5));
    const acts = [
      ['残り火 +1000', () => this.dbgEdit((p) => { p.embers += 1000; p.lifetimeEmbers += 1000; })],
      ['魂炎 +5', () => this.dbgEdit((p) => { p.soulflame += 5; p.lifetimeSoulflame += 5; })],
      ['難易度 全解放', () => this.dbgEdit((p) => { p.unlockedDifficulties = ProgressionManager.difficulties().map((d) => d.id); })],
      ['転生条件 達成', () => this.dbgEdit((p) => { p.highestClearedDifficulty = 3; p.highestEverDifficulty = Math.max(3, p.highestEverDifficulty); })],
      ['profile v3→v4 移行テスト', () => this.dbgMigrateTest()],
      ['profile 初期化', () => { localStorage.removeItem('rfs_profile'); location.reload(); }],
    ];
    let yy = GAME_HEIGHT / 2 - 74;
    for (const [label, fn] of acts) {
      const b = this.add.text(GAME_WIDTH / 2, yy, label, { fontSize: '10px', color: '#fff', backgroundColor: '#1a3a3e', padding: { x: 6, y: 2 } }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      b.on('pointerdown', fn);
      ui.add(b); yy += 22;
    }
    const close = this.add.text(GAME_WIDTH / 2, yy + 4, '閉じる (F1)', { fontSize: '9px', color: '#bcaaa4' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.toggleDebug());
    ui.add(close);
    this._dbg = ui;
  }

  dbgEdit(fn) {
    const p = SaveManager.loadProfile();
    fn(p);
    SaveManager.saveProfile(p);
    this.toggleDebug();
    this.refresh();
  }

  dbgMigrateTest() {
    const v3 = { save_version: 3, game_version: '0.3.0', embers: 123, lifetimeEmbers: 6000, permanentUpgrades: { max_hp: 3 }, unlockedDifficulties: [1, 2, 3], highestClearedDifficulty: 3, skillMastery: { fireball: { casts: 1, hits: 2, kills: 1, damage: 500, maxLevel: 8, runsUsed: 2 } }, statistics: { totalPlayTime: 100, totalRuns: 3, totalWins: 2, totalDefeats: 1, totalKills: 300, totalBossKills: 2, highestDamage: 900 }, lastResultId: 'x' };
    localStorage.setItem('rfs_profile', JSON.stringify(v3));
    location.reload();
  }

  // ---------------- 戦闘開始 ----------------
  startBattle() { this.scene.start('BattleScene', { difficulty: this.profile.selectedDifficulty || 1, resume: null }); }
}
