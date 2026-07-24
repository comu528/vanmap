// BossFrostbreakDisplay（Milestone 7-B.1）: 氷術師のボス氷砕ゲージ・frostbreak・vulnerability の表示を担当する。
// ゲージ本体は HUD（ボスHP直下）に描画し、本クラスは「表示すべき状態」の解決（純ロジック）＋ frostbreak の
// ワールド演出（FROST BREAK 文字・氷片・ゲージ割れ）＋ vulnerability の点滅制御を行う。閾値/CD/vuln 倍率は変更しない。

// ---- 純ロジック（Phaser 非依存・テスト対象）----
// ボス氷砕表示に必要な状態を1か所で解決する。HUD 更新・テストが共有する。
// visible は「氷術師（jobElement==='ice'）かつボスが存在し生存」時のみ true（火の魔女/ボス不在では空ゲージを出さない）。
export function bossFrostDisplayState(boss, sfx, jobElement, now) {
  if (jobElement !== 'ice' || !boss || !boss.alive) return { visible: false };
  const gauge = Math.max(0, boss._frostGauge || 0);
  const threshold = sfx.bossThreshold(boss);
  const breaks = boss._frostBreaks || 0;
  const vulnUntil = boss._frostbreakVulnUntil || 0;
  const cdUntil = boss._frostbreakCdUntil || 0;
  const vulnActive = now < vulnUntil;
  return {
    visible: true,
    gauge, threshold,
    ratio: threshold > 0 ? Math.max(0, Math.min(1, gauge / threshold)) : 0,
    breaks,
    cooldownRemain: Math.max(0, cdUntil - now),
    vulnRemain: Math.max(0, vulnUntil - now),
    vulnActive,
    iceMultiplier: sfx.bossIceVulnMultiplier(boss),
  };
}

// ---- Phaser 表示クラス（BattleScene からのみ生成）----
export class BossFrostbreakDisplay {
  constructor(scene, hud) {
    this.scene = scene;
    this.hud = hud;
    this._unsub = null;
    this._cfg = null; // statusVisuals 設定（DataManager から）
    this._effectsThisWindow = 0;
  }

  setConfig(cfg) { this._cfg = cfg || {}; }

  subscribe(sfx) {
    if (!sfx || !sfx.on) return;
    this._unsub = sfx.on((type, e, data) => {
      if (!e || !e.isBoss) return;
      if (type === 'frostbreakTriggered') this._onBreak(e, data);
      else if (type === 'bossFrostGaugeChanged') this._pulse();
    });
  }

  // 毎フレーム: 純状態から HUD ゲージの表示/更新を行う（vuln 中は点滅）。
  update(boss, sfx, jobElement, now) {
    if (!this.hud) return null;
    const st = bossFrostDisplayState(boss, sfx, jobElement, now);
    if (!st.visible) { this.hud.hideBossFrost(); return st; }
    this.hud.showBossFrost();
    const blinkPeriod = (this._cfg && this._cfg.vulnerability && this._cfg.vulnerability.blinkPeriodMs) || 320;
    this.hud.updateBossFrost(st.gauge, st.threshold, st.breaks, st.vulnActive, {
      cooldownRemain: st.cooldownRemain, vulnRemain: st.vulnRemain, now, blinkPeriodMs: blinkPeriod,
    });
    return st;
  }

  _pulse() {
    const bar = this.hud && this.hud.bossFrostBar;
    if (!bar || !this.scene.tweens) return;
    bar.setScale(1, 1.6);
    this.scene.tweens.add({ targets: bar, scaleY: 1, duration: 160 });
  }

  _onBreak(boss, data) {
    if (!this.scene.add) return;
    const cap = this.scene.combat ? this.scene.combat.skillCap('maxFrostbreakEffects', 2) : 2;
    if (this._effectsThisWindow >= cap) return;
    this._effectsThisWindow++;
    this.scene.time.delayedCall(600, () => { this._effectsThisWindow = Math.max(0, this._effectsThisWindow - 1); });
    const fb = (this._cfg && this._cfg.frostbreak) || { showText: true, textDurationMs: 900, shardCount: 8 };
    // ゲージ割れ＋ボス周辺の氷片・衝撃輪。
    if (this.scene.effects) { this.scene.effects.explosion?.(boss.x, boss.y, 46, 0x9fe8ff); this.scene.effects.sparks?.(boss.x, boss.y, Math.min(fb.shardCount || 8, 10), 0xe1f5fe); }
    if (fb.showText !== false) {
      const t = this.scene.add.text(boss.x, boss.y - 30, 'FROST BREAK', { fontSize: '11px', color: '#e1f5fe', fontStyle: 'bold', stroke: '#0d1017', strokeThickness: 2 }).setOrigin(0.5).setDepth(62);
      this.scene.tweens.add({ targets: t, y: boss.y - 46, alpha: 0, duration: fb.textDurationMs || 900, onComplete: () => t.destroy() });
    }
  }

  destroy() { if (this._unsub) this._unsub(); this._unsub = null; }
}
