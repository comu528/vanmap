// WarriorHud（Milestone 8-B: 戦士）: 闘気ゲージ・闘気解放・コンボ・不屈・ボス体勢ゲージの表示。
// 設計は BossFrostbreakDisplay と同じ二層構成にする。
//   1) warriorHudState(): Phaser 非依存の純ロジック（テスト対象）。表示すべき値だけを返す。
//   2) WarriorHud: 上の状態を Phaser の Text/Rectangle へ流し込むだけの薄い表示層。
// 戦士以外のジョブでは visible=false となり、既存 HUD には一切要素を足さない。

import { GAME_WIDTH } from '../config/game-config.js';

// ---- 純ロジック（Phaser 非依存・テスト対象）----
// w: WarriorCombatSystem / isWarrior: 戦士周回か / boss: 現在のボス（無ければ null）
export function warriorHudState(w, isWarrior, boss) {
  if (!isWarrior || !w || !w.enabled) return { visible: false };
  const bp = w.bossPoise;
  const bossVisible = !!(boss && boss.alive);
  const th = w.bossPoiseThreshold();
  return {
    visible: true,
    fury: w.fury,
    furyMax: w.cfg.fury.max,
    furyRatio: w.furyRatio,
    releaseActive: w.releaseActive,
    releaseRemainMs: w.releaseLeftMs,
    recoveryRemainMs: w.recovery.leftMs,
    combo: Math.floor(w.combo),
    comboGraceMs: w.comboGraceLeftMs,
    comboDecaying: w.combo > 0 && w.comboGraceLeftMs <= 0,
    comboThresholds: w.comboBonuses().reached,
    unyieldingActive: w.unyieldingActive,
    unyieldingReady: w.unyieldingReady,
    unyieldingCooldownMs: w.unyielding.cooldownLeftMs,
    bossPoiseVisible: bossVisible,
    bossPoiseGauge: bossVisible ? bp.gauge : 0,
    bossPoiseThreshold: bossVisible ? th : 0,
    bossPoiseRatio: bossVisible && th > 0 ? Math.max(0, Math.min(1, bp.gauge / th)) : 0,
    bossPoiseBreaks: bossVisible ? bp.breaks : 0,
    exposedActive: bossVisible && w.exposedActive,
    exposedRemainMs: bossVisible ? bp.exposedLeftMs : 0,
  };
}

// ---- Phaser 表示クラス（BattleScene からのみ生成）----
export class WarriorHud {
  constructor(scene) {
    this.scene = scene;
    const add = scene.add;
    this.container = add.container(0, 0).setScrollFactor(0).setDepth(1001);

    // 闘気ゲージ（HPバー/経験値バーの下）。
    this.furyBg = add.rectangle(8, 32, 160, 8, 0x2b1b12).setOrigin(0, 0).setScrollFactor(0);
    this.furyBar = add.rectangle(9, 33, 0, 6, 0xffa726).setOrigin(0, 0).setScrollFactor(0);
    this.furyText = add.text(172, 31, '', { fontSize: '8px', color: '#ffcc80' }).setScrollFactor(0);
    // コンボ（画面右上）。
    this.comboText = add.text(GAME_WIDTH - 8, 40, '', { fontSize: '13px', color: '#ffd54f', fontStyle: 'bold' }).setOrigin(1, 0).setScrollFactor(0);
    // 不屈（闘気ゲージの下）。
    this.unyieldingText = add.text(8, 42, '', { fontSize: '8px', color: '#90caf9' }).setScrollFactor(0);
    // ボス体勢ゲージ（ボスHPの下・ボス出現中のみ）。
    this.poiseBg = add.rectangle(GAME_WIDTH / 2 - 90, 62, 180, 6, 0x2b1b12).setOrigin(0, 0).setScrollFactor(0);
    this.poiseBar = add.rectangle(GAME_WIDTH / 2 - 89, 63, 0, 4, 0xffb74d).setOrigin(0, 0).setScrollFactor(0);
    this.poiseText = add.text(GAME_WIDTH / 2, 69, '', { fontSize: '8px', color: '#ffcc80' }).setOrigin(0.5, 0).setScrollFactor(0);

    this._all = [this.furyBg, this.furyBar, this.furyText, this.comboText, this.unyieldingText, this.poiseBg, this.poiseBar, this.poiseText];
    this.container.add(this._all);
    this.setVisible(false);
    this._banners = 0;
  }

  setVisible(v) { for (const o of this._all) o.setVisible(v); }

  update(w, isWarrior, boss) {
    const st = warriorHudState(w, isWarrior, boss);
    if (!st.visible) { this.setVisible(false); return st; }
    this.furyBg.setVisible(true); this.furyBar.setVisible(true); this.furyText.setVisible(true);
    this.furyBar.width = Math.max(0, 158 * st.furyRatio);
    this.furyBar.fillColor = st.releaseActive ? 0xff7043 : 0xffa726;
    this.furyText.setVisible(true).setText(st.releaseActive
      ? `闘気解放 ${(st.releaseRemainMs / 1000).toFixed(1)}s`
      : `闘気 ${Math.floor(st.fury)}/${st.furyMax}`);

    // コンボ（0 のときは非表示。grace 切れ＝減衰中は色を変える）。
    if (st.combo > 0) {
      this.comboText.setVisible(true).setText(`${st.combo} COMBO`);
      this.comboText.setColor(st.comboDecaying ? '#ff8a65' : '#ffd54f');
    } else this.comboText.setVisible(false);

    // 不屈（発動中 / 待機可能 / CD 残り）。
    this.unyieldingText.setVisible(true).setText(
      st.unyieldingActive ? '不屈 発動中'
        : (st.unyieldingReady ? '不屈 待機' : `不屈 ${Math.ceil(st.unyieldingCooldownMs / 1000)}s`));
    this.unyieldingText.setColor(st.unyieldingActive ? '#ffe082' : (st.unyieldingReady ? '#90caf9' : '#78909c'));

    // ボス体勢ゲージ（露出中は「露出」と残秒を出す）。
    const bv = st.bossPoiseVisible;
    this.poiseBg.setVisible(bv); this.poiseBar.setVisible(bv); this.poiseText.setVisible(bv);
    if (bv) {
      this.poiseBar.width = Math.max(0, 178 * st.bossPoiseRatio);
      this.poiseBar.fillColor = st.exposedActive ? 0xff7043 : 0xffb74d;
      this.poiseText.setText(st.exposedActive
        ? `露出 ${(st.exposedRemainMs / 1000).toFixed(1)}s（体勢崩し ${st.bossPoiseBreaks}）`
        : `体勢 ${Math.floor(st.bossPoiseGauge)}/${Math.round(st.bossPoiseThreshold)}（崩し ${st.bossPoiseBreaks}）`);
    }
    return st;
  }

  // WarriorCombatSystem のイベント（演出のみ。ロジックへは影響しない）。
  onEvent(type) {
    if (type === 'furyRelease' && this.scene.tweens) {
      this.furyBar.setScale(1, 1.8);
      this.scene.tweens.add({ targets: this.furyBar, scaleY: 1, duration: 180 });
    } else if (type === 'bossStanceBreak' && this.scene.tweens) {
      this.poiseBar.setScale(1, 2);
      this.scene.tweens.add({ targets: this.poiseBar, scaleY: 1, duration: 200 });
    }
  }

  destroy() {
    for (const o of this._all) { if (o && o.destroy) o.destroy(); }
    this._all = [];
    if (this.container) { this.container.destroy(); this.container = null; }
  }
}
