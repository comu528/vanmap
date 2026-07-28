// StatusDebugPanel（Milestone 7-B.1）: ?debug=1 限定の状態異常デバッグ表示。選択した敵/ボスの状態実数・
// 凍結判定内訳・実動作カウンタを表示する。行内容の生成（純ロジック）は下部の export 関数へ集約し Node からテスト可能。
// デバッグ表示は profile を変更せず、使用時は debugRun として通常統計から分離する（BattleScene.markDebugRun）。

// ---- 純ロジック（Phaser 非依存・テスト対象）----

// エンティティが現在持つ状態 id 一覧（索引ではなく権威フィールドから解決）。
export function activeStatusesOf(e, sfx, now) {
  const t = (now == null) ? sfx.now() : now;
  const out = [];
  if (e && e.isBoss) {
    if ((e._frostGauge || 0) > 0) out.push('frostGauge');
    if (t < (e._frostbreakVulnUntil || 0)) out.push('frostbreak_vulnerability');
    if (t < (e._frostbreakCdUntil || 0)) out.push('frostbreak_cooldown');
    if (e.ignited) out.push('burning');
    return out;
  }
  if (sfx.isFrozen(e)) out.push('frozen');
  if (sfx.isChilled(e)) out.push('chill');
  if (sfx.isFreezeImmune(e)) out.push('freeze_immunity');
  if (e && e.ignited) out.push('burning');
  return out;
}

// 通常敵/エリートの状態実数の行（HP/種別/冷気/減速/凍結/耐性/確率上限/倍率/active/最後の付与skill）。
export function enemyDebugLines(e, sfx, now) {
  if (!e) return ['(対象なし)'];
  const t = (now == null) ? sfx.now() : now;
  const type = sfx.entityType(e);
  const fs = sfx.fs;
  const cap = fs.chillCap(type);
  const chill = sfx.chillOf(e);
  const frozenRemain = Math.max(0, (e._frozenUntil || 0) - t);
  const immRemain = Math.max(0, (e._freezeImmuneUntil || 0) - t);
  const L = [];
  L.push(`種別:${type}  HP:${Math.max(0, Math.round(e.hp))}/${Math.round(e.maxHp || 0)}`);
  L.push(`冷気:${chill.toFixed(1)}/${cap}  比率:${(sfx.chillRatio(e) * 100).toFixed(0)}%  確定閾値:${fs.guaranteedThreshold(type).toFixed(0)}`);
  L.push(`減速:${((e._chillSlow || 0) * 100).toFixed(0)}%  freezeChanceCap:${(fs.profile(type).freezeChanceCap * 100).toFixed(0)}%`);
  L.push(`chillGain×${fs.chillGainMultiplier(type).toFixed(2)}  freezeDur×${(fs.profile(type).freezeDurationMultiplier || 1).toFixed(2)}  immGain×${fs.immunityChillGainMultiplier(type).toFixed(2)}`);
  L.push(`凍結:${sfx.isFrozen(e) ? `中(${(frozenRemain / 1000).toFixed(1)}s)` : '×'}  耐性:${sfx.isFreezeImmune(e) ? `中(${(immRemain / 1000).toFixed(1)}s)` : '×'}`);
  L.push(`状態:[${activeStatusesOf(e, sfx, t).join(',') || 'なし'}]  最後の冷気付与:${e._lastChillSkillId || '-'}`);
  return L;
}

// 凍結判定の内訳（e._statusDebug は StatusEffectManager.applyIceHit が記録・保存しない）。
export function freezeBreakdownLines(e) {
  const d = e && e._statusDebug;
  if (!d) return ['凍結判定: (未判定)'];
  if (d.skipped) return [`凍結判定: スキップ(${d.skipped === 'immunity' ? '耐性' : 'hitGroup上限'})  hitGroup:${d.hitGroupId ?? '-'}  判定回数:${d.checksForGroup ?? '-'}`];
  const base = (d.baseFreezeChance || 0) * (d.procCoefficient || 1);
  const fromChill = (d.chillRatio || 0) * (d.chanceFromChill || 0) * (d.procCoefficient || 1);
  return [
    `base×proc:${base.toFixed(3)}  冷気寄与:${fromChill.toFixed(3)}  proc:${(d.procCoefficient || 1).toFixed(2)}`,
    `最終freezeChance:${d.guaranteed ? '確定' : (d.chance * 100).toFixed(1) + '%'}  roll:${d.roll == null ? '-' : d.roll.toFixed(3)}  結果:${d.result ? '凍結' : '非凍結'}`,
    `hitGroup:${d.hitGroupId ?? '-'}  同group判定回数:${d.checksForGroup ?? '-'}`,
  ];
}

// ボスの氷砕状態の行。
export function bossDebugLines(boss, sfx, now) {
  if (!boss || !boss.alive) return ['(ボスなし)'];
  const t = (now == null) ? sfx.now() : now;
  const gauge = boss._frostGauge || 0;
  const threshold = sfx.bossThreshold(boss);
  const breaks = boss._frostBreaks || 0;
  const c = sfx.fs.bossConfig();
  const growth = Math.min(Math.pow(c.thresholdGrowthPerBreak || 1.3, breaks), c.maximumThresholdMultiplier || 3);
  return [
    `氷砕ゲージ:${gauge.toFixed(1)} / ${threshold.toFixed(0)}  (${threshold > 0 ? (gauge / threshold * 100).toFixed(0) : 0}%)`,
    `break回数:${breaks}  threshold倍率:×${growth.toFixed(2)}`,
    `cooldown残:${(Math.max(0, (boss._frostbreakCdUntil || 0) - t) / 1000).toFixed(1)}s  vuln残:${(Math.max(0, (boss._frostbreakVulnUntil || 0) - t) / 1000).toFixed(1)}s`,
    `iceダメージ倍率:×${sfx.bossIceVulnMultiplier(boss).toFixed(2)}  状態:[${activeStatusesOf(boss, sfx, t).join(',') || 'なし'}]`,
    `最後のゲージ付与:${boss._lastGaugeSkillId || '-'}`,
  ];
}

// 実動作カウンタの行（#11）。CombatTelemetry と重複する shatters/frostbreaks/bossGauge は telemetry を正とする。
// opts: { frozenCount, immuneCount, burningCount, indexSize, visualCapReached, applicationCapReached, telemetry }。
export function counterLines(sfx, opts = {}) {
  const c = sfx.counters();
  const tele = opts.telemetry && opts.telemetry.status ? opts.telemetry.status : {};
  return [
    `冷気付与:${c.chillApplications}  累計冷気:${Math.round(c.chillAmountTotal)}`,
    `凍結試行:${c.freezeAttempts}  凍結成功:${c.freezeSuccesses}`,
    `耐性で防止:${c.immunitySkips}  hitGroup上限で防止:${c.hitGroupSkips}`,
    `現在凍結:${opts.frozenCount || 0}  現在耐性:${opts.immuneCount || 0}  炎上中:${opts.burningCount || 0}`,
    `粉砕:${tele.shatters || 0}  ボスゲージ付与:${c.bossGaugeApplications}  氷砕:${tele.bossFrostbreaks || 0}`,
    `状態索引サイズ:${opts.indexSize || 0}  表示上限到達:${opts.visualCapReached || 0}  付与上限到達:${opts.applicationCapReached || 0}`,
  ];
}

// ---- Phaser 表示クラス（?debug=1・BattleScene からのみ生成）----
export class StatusDebugPanel {
  constructor(scene) {
    this.scene = scene;
    this.container = null;
    this.target = null;   // 選択中の敵/ボス（弱参照的に保持・死亡で解除）
    this.visible = false;
    // M7-E: 直近の状態イベント履歴（表示のみ・保存しない・上限は品質別 maxStatusDebugHistory）。
    this.history = [];
    this._unsub = null;
  }

  // StatusEffectManager のイベントを購読して履歴へ積む（判定・RNG・保存へは一切影響しない）。
  subscribe(sfx) {
    if (!sfx || !sfx.on || this._unsub) return;
    this._unsub = sfx.on((type, e, data) => this.pushHistory(type, e, data));
  }

  _historyCap() { return this.scene.combat ? this.scene.combat.skillCap('maxStatusDebugHistory', 24) : 24; }

  pushHistory(type, e, data) {
    const cap = Math.max(0, this._historyCap());
    if (cap <= 0) { this.history.length = 0; return; }
    const t = this.scene.time ? Math.round(this.scene.time.now) : 0;
    const who = e && e.isBoss ? 'boss' : (e && e.isElite ? 'elite' : 'normal');
    let extra = '';
    if (data && data.chill != null) extra = ` chill=${Number(data.chill).toFixed(0)}`;
    else if (data && data.gauge != null) extra = ` gauge=${Number(data.gauge).toFixed(0)}/${Number(data.threshold || 0).toFixed(0)}`;
    else if (data && data.damage != null) extra = ` dmg=${Number(data.damage).toFixed(0)}`;
    this.history.push(`${t} ${type}(${who})${extra}`);
    while (this.history.length > cap) this.history.shift();
  }

  toggle() { this.visible ? this.close() : this.open(); }

  open() {
    if (this.container) return;
    const s = this.scene;
    this.visible = true;
    const c = s.add.container(0, 0).setScrollFactor(0).setDepth(4200);
    this.bg = s.add.rectangle(4, 30, 300, 300, 0x08131a, 0.9).setOrigin(0, 0).setScrollFactor(0).setStrokeStyle(1, 0x4fc3f7);
    this.title = s.add.text(8, 32, '状態異常デバッグ（F10・敵クリックで選択）', { fontSize: '9px', color: '#4fc3f7' }).setScrollFactor(0);
    this.body = s.add.text(8, 46, '', { fontSize: '8px', color: '#b2ebf2', lineSpacing: 2, wordWrap: { width: 288 } }).setScrollFactor(0);
    this.sel = s.add.rectangle(0, 0, 20, 20, 0x000000, 0).setStrokeStyle(1, 0xffff00, 0.9).setVisible(false).setDepth(4100);
    c.add([this.bg, this.title, this.body]);
    this.container = c;
  }

  close() {
    this.visible = false;
    if (this.container) { this.container.destroy(true); this.container = null; }
    if (this.sel) { this.sel.destroy(); this.sel = null; }
    this.target = null;
  }

  // 選択対象の維持（死亡・返却で解除）。
  _validTarget() {
    const t = this.target;
    if (t && t.alive) return t;
    this.target = null; return null;
  }

  setTarget(e) { this.target = (e && e.alive) ? e : null; }

  update(sfx, boss) {
    if (!this.visible || !this.container) return;
    const now = sfx.now();
    const t = this._validTarget();
    const L = [];
    if (t) {
      L.push('― 選択対象 ―');
      if (t.isBoss) { for (const s of bossDebugLines(t, sfx, now)) L.push(s); }
      else { for (const s of enemyDebugLines(t, sfx, now)) L.push(s); for (const s of freezeBreakdownLines(t)) L.push(s); }
      if (this.sel) this.sel.setVisible(true).setPosition(t.x, t.y).setSize((t.displayWidth || 16) + 6, (t.displayHeight || 16) + 6);
    } else {
      L.push('― 対象未選択（敵をクリック / 最も近い敵を自動表示）―');
      if (this.sel) this.sel.setVisible(false);
    }
    if (boss && boss.alive) { L.push('― ボス ―'); for (const s of bossDebugLines(boss, sfx, now)) L.push(s); }
    L.push('― 実動作カウンタ ―');
    const idxSize = sfx.statusIndexSize ? sfx.statusIndexSize() : 0;
    for (const s of counterLines(sfx, {
      frozenCount: sfx.countStatus('frozen'), immuneCount: sfx.countStatus('freeze_immunity'),
      burningCount: this.scene.burningCount ? this.scene.burningCount() : 0,
      indexSize: idxSize, visualCapReached: this._sumReached(this.scene.statusVisuals && this.scene.statusVisuals.capReached()),
      applicationCapReached: this._sumReached(sfx.capReached && sfx.capReached()), telemetry: this.scene.telemetry,
    })) L.push(s);
    if (this.history.length) {
      L.push(`― 直近イベント（最大${this._historyCap()}件・保存しない）―`);
      for (const h of this.history.slice(-6)) L.push(h);
    }
    this.body.setText(L.join('\n'));
  }

  _sumReached(obj) { if (!obj) return 0; let n = 0; for (const k in obj) n += obj[k]; return n; }

  destroy() { this.close(); if (this._unsub) { this._unsub(); this._unsub = null; } this.history.length = 0; }
}
