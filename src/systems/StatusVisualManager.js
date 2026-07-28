// StatusVisualManager（Milestone 7-B.1）: 状態異常（冷気/減速/凍結/凍結耐性/粉砕/炎上）の「表示」だけを担う。
// 状態ロジック（StatusEffectManager / FreezeSystem）とは分離し、状態は権威フィールド（_chill/_frozenUntil/…）を
// 毎フレーム参照（reconcile）してオーバーレイ層へ反映する。enemy.setTint を状態ごとに奪い合わず、被弾フラッシュ・
// ダッシャー予告・エリート色を上書きしない。品質別上限で装飾を抑制するが、状態ロジック（凍結解除/耐性/索引）は不変。
//
// 純ロジック（tier 判定・アイコン優先度・上限・可視状態）は下部の export 関数に集約し Node からテストできる。
// Phaser 描画はこのクラスが担当（BattleScene からのみ生成・ブラウザ実挙動は未検証）。

// ---- 純ロジック（Phaser 非依存・テスト対象）----

// 冷気比率 → 段階。0=none / 1〜39%=low / 40〜74%=mid / 75%+=high。
export function chillTierOf(ratio) {
  if (!(ratio > 0)) return 'none';
  if (ratio < 0.40) return 'low';
  if (ratio < 0.75) return 'mid';
  return 'high';
}

// guaranteedFreezeThreshold の 90% 以上か（確定凍結直前の事前通知）。
export function isNearThreshold(chill, guaranteedThreshold) {
  return guaranteedThreshold > 0 && chill >= guaranteedThreshold * 0.9;
}

// 頭上アイコンの優先度（高い順）。frozen > burning > freeze_immunity > chill_high。
export const ICON_PRIORITY = ['frozen', 'burning', 'freeze_immunity', 'chill_high'];

// 状態から表示すべきアイコン id を優先度順・最大数まで返す。
// state: { frozen, burning, freezeImmune, chillHigh }。
export function selectIcons(state, maxIcons) {
  const present = [];
  if (state.frozen) present.push('frozen');
  if (state.burning) present.push('burning');
  if (state.freezeImmune) present.push('freeze_immunity');
  if (state.chillHigh) present.push('chill_high');
  // present は既に優先度順（ICON_PRIORITY と同順で push）。最大数でクランプ。
  const cap = Math.max(0, maxIcons | 0);
  return present.slice(0, cap);
}

// low 品質で装飾を落とす優先順位（残す順＝frozen が最優先で最後まで残る）。
export const LOW_QUALITY_KEEP_ORDER = ['frozen', 'boss_frostbreak', 'shatter', 'burning', 'freeze_immunity', 'chill', 'slow'];

// エンティティの可視状態を権威フィールドから解決する（純・テスト用）。
// sfx: StatusEffectManager（isFrozen/isFreezeImmune/chillOf/chillRatio）。burning は e.ignited（無ければ false）。
export function entityVisualState(e, sfx) {
  const chill = sfx.chillOf(e);
  const ratio = sfx.chillRatio(e);
  const tier = chillTierOf(ratio);
  const type = sfx.entityType(e);
  const guaranteed = sfx.fs.guaranteedThreshold ? sfx.fs.guaranteedThreshold(type === 'boss' ? 'normal' : type) : 0;
  return {
    chill, ratio, tier,
    frozen: sfx.isFrozen(e),
    freezeImmune: sfx.isFreezeImmune(e),
    burning: !!(e && e.ignited),
    chillHigh: tier === 'high',
    near: isNearThreshold(chill, guaranteed),
    slow: (e && e._chillSlow) || 0,
    hasAny() { return this.frozen || this.freezeImmune || this.burning || this.tier !== 'none'; },
  };
}

// 上限カウンタ（表示上限に達しても状態ロジックは不変・到達数を可視化）。
export class VisualBudget {
  constructor(caps) { this.caps = caps || {}; this.reached = {}; this._used = {}; }
  reset() { this._used = {}; }
  take(kind, cap) {
    const limit = (cap != null) ? cap : (this.caps[kind] != null ? this.caps[kind] : Infinity);
    const used = this._used[kind] || 0;
    if (used >= limit) { this.reached[kind] = (this.reached[kind] || 0) + 1; return false; }
    this._used[kind] = used + 1;
    return true;
  }
  used(kind) { return this._used[kind] || 0; }
  capReached() { return { ...this.reached }; }
}

// ---- Phaser 表示クラス（BattleScene からのみ生成）----

const COLOR_CHILL = 0x9fe8ff, COLOR_FROZEN = 0x80d8ff, COLOR_IMMUNE = 0xe1f5fe, COLOR_BURN = 0xff7043;

export class StatusVisualManager {
  constructor(scene) {
    this.scene = scene;
    this._overlays = new Map();     // entity -> overlay record
    this._reached = {};             // 表示上限到達（デバッグ用）
    this._acc = 0;                  // 更新間隔スロットル
    this._floatingThisFrame = 0;
    this._shatterThisFrame = 0;
    this._layer = scene.add ? scene.add.container(0, 0).setDepth(56) : null;
    this._unsub = null;
    this._cap = (n, f) => (scene.combat ? scene.combat.skillCap(n, f) : f);
  }

  // StatusEffectManager のイベントを購読（ワンショット演出のみ・持続表示は reconcile が担当）。
  subscribe(sfx) {
    if (!sfx || !sfx.on) return;
    this._unsub = sfx.on((type, e, data) => {
      if (type === 'shatterTriggered') this.onShatter(data.x != null ? data.x : (e && e.x), data.y != null ? data.y : (e && e.y));
      else if (type === 'frozenStarted') this._crack(e && e.x, e && e.y, COLOR_FROZEN, 5);
      else if (type === 'frozenEnded') this._crack(e && e.x, e && e.y, COLOR_IMMUNE, 4);
      else if (type === 'chillThresholdNear') this._nearFlash(e);
    });
  }

  beginFrame() { this._floatingThisFrame = 0; this._shatterThisFrame = 0; }

  // 毎フレーム: スロットル付きで全アクティブ敵＋ボスの状態を reconcile（権威フィールドから）。
  update(dt, sfx, activeEnemies, boss) {
    if (!this.scene.add) return;
    this._acc += dt;
    const interval = this._cap('statusVisualUpdateInterval', 60);
    if (this._acc < interval) return;
    this._acc = 0;
    this._reconcile(sfx, activeEnemies, boss);
  }

  _reconcile(sfx, activeEnemies, boss) {
    const caps = {
      chill: this._cap('maxChillVisuals', 70), frozen: this._cap('maxFrozenVisuals', 50),
      immune: this._cap('maxImmunityVisuals', 35), slow: this._cap('maxSlowTrails', 28),
      icons: this._cap('maxStatusIcons', 2),
    };
    const budget = new VisualBudget(caps); budget.reset();
    const seen = new Set();
    const list = [];
    if (activeEnemies) for (const e of activeEnemies) if (e && e.alive) list.push(e);
    if (boss && boss.alive) list.push(boss);
    for (const e of list) {
      const st = entityVisualState(e, sfx);
      if (!st.hasAny()) { this._destroyOverlay(e); continue; }
      seen.add(e);
      this._applyOverlay(e, st, budget, caps);
    }
    // 掃除: 見なかった（死亡/返却/状態解除/Scene外）オーバーレイを破棄。
    for (const e of this._overlays.keys()) if (!seen.has(e)) this._destroyOverlay(e);
    this._reached = budget.capReached();
  }

  _applyOverlay(e, st, budget, caps) {
    let o = this._overlays.get(e);
    if (!o) { o = this._makeOverlay(); this._overlays.set(e, o); }
    o.c.setPosition(e.x, e.y).setVisible(true);
    // 冷気リング（tier で色/濃さ）。frozen 中は氷殻を優先。
    const ring = o.ring;
    if (st.frozen) {
      // 氷殻（本体は隠さない半透明の青い輪郭）。
      if (budget.take('frozen', caps.frozen)) { o.shell.setVisible(true).setStrokeStyle(2, COLOR_FROZEN, 0.9); o.shell.setFillStyle(COLOR_FROZEN, 0.12); }
      else o.shell.setVisible(false);
      ring.setVisible(false);
    } else {
      o.shell.setVisible(false);
      if (st.tier === 'none') ring.setVisible(false);
      else {
        const alpha = st.tier === 'low' ? 0.10 : (st.tier === 'mid' ? 0.18 : 0.28);
        const stroke = st.tier === 'low' ? 0 : (st.tier === 'mid' ? 1 : 1.5);
        if (budget.take('chill', caps.chill)) {
          ring.setVisible(true).setFillStyle(COLOR_CHILL, alpha);
          if (stroke > 0) ring.setStrokeStyle(stroke, st.tier === 'high' ? 0xe1f5fe : COLOR_CHILL, 0.6); else ring.setStrokeStyle();
        } else ring.setVisible(false);
      }
    }
    // 減速残像（高冷気のみ・控えめ）。装飾上限に達しても slow ロジックは不変。
    o.slow.setVisible(!st.frozen && st.slow > 0.12 && budget.take('slow', caps.slow));
    // 凍結耐性マーク（frozen でないとき）。
    o.imm.setVisible(!st.frozen && st.freezeImmune && budget.take('immune', caps.immune));
    // 頭上アイコン（優先度・最大数）。
    const icons = selectIcons({ frozen: st.frozen, burning: st.burning, freezeImmune: st.freezeImmune, chillHigh: st.chillHigh }, caps.icons);
    this._drawIcons(o, icons);
  }

  _drawIcons(o, iconIds) {
    for (let i = 0; i < o.icons.length; i++) {
      const g = o.icons[i];
      if (i < iconIds.length) { g.setVisible(true); this._paintIcon(g, iconIds[i]); g.x = (i - (iconIds.length - 1) / 2) * 8; }
      else g.setVisible(false);
    }
  }

  _paintIcon(g, id) {
    g.clear();
    const col = id === 'frozen' ? COLOR_FROZEN : id === 'burning' ? COLOR_BURN : id === 'freeze_immunity' ? COLOR_IMMUNE : COLOR_CHILL;
    g.fillStyle(col, 0.95);
    if (id === 'frozen') { g.fillTriangle(0, -3, -2.5, 1, 2.5, 1); g.fillTriangle(0, 3, -2.5, -1, 2.5, -1); }
    else if (id === 'burning') { g.fillTriangle(0, -3, -2, 2, 2, 2); }
    else if (id === 'freeze_immunity') { g.fillRoundedRect(-2.5, -3, 5, 6, 1.5); g.fillStyle(0x0d1017, 1); g.fillCircle(0, 0, 1); }
    else { g.fillCircle(0, 0, 2); } // chill_high
  }

  _makeOverlay() {
    const s = this.scene;
    const c = s.add.container(0, 0).setDepth(56);
    const ring = s.add.circle(0, 6, 9, COLOR_CHILL, 0.12).setVisible(false);
    const shell = s.add.circle(0, 0, 11, COLOR_FROZEN, 0.12).setStrokeStyle(2, COLOR_FROZEN, 0.9).setVisible(false);
    const slow = s.add.ellipse(0, 8, 16, 5, COLOR_CHILL, 0.18).setVisible(false);
    const imm = s.add.circle(0, -10, 3, COLOR_IMMUNE, 0.35).setStrokeStyle(1, COLOR_IMMUNE, 0.8).setVisible(false);
    const icons = [];
    for (let i = 0; i < 3; i++) { const g = s.add.graphics(); g.y = -14; g.setVisible(false); icons.push(g); }
    c.add([slow, ring, shell, imm, ...icons]);
    if (this._layer) this._layer.add(c);
    return { c, ring, shell, slow, imm, icons };
  }

  _destroyOverlay(e) {
    const o = this._overlays.get(e);
    if (!o) return;
    o.c.destroy(true); // 子（ring/shell/slow/imm/icons）も破棄
    this._overlays.delete(e);
  }

  // ワンショット: 粉砕（氷片放射＋「SHATTER」フロートテキスト）。上限で装飾のみ抑制。
  onShatter(x, y) {
    if (x == null || y == null || !this.scene.add) return;
    if (this._shatterThisFrame >= this._cap('maxShatterEffectsPerFrame', 8)) { this._bump('shatter'); return; }
    this._shatterThisFrame++;
    this._crack(x, y, 0xffffff, 7);
    if (this.scene.effects && this.scene.effects.explosion) this.scene.effects.explosion(x, y, 22, 0xe1f5fe);
    if (this._floatingThisFrame < this._cap('maxStatusFloatingTextsPerFrame', 10)) {
      this._floatingThisFrame++;
      const t = this.scene.add.text(x, y - 12, 'SHATTER', { fontSize: '8px', color: '#e1f5fe', fontStyle: 'bold' }).setOrigin(0.5).setDepth(60);
      this.scene.tweens.add({ targets: t, y: y - 24, alpha: 0, duration: 520, onComplete: () => t.destroy() });
    } else this._bump('floating_text');
  }

  _crack(x, y, color, n) {
    if (x == null || y == null || !this.scene.add) return;
    if (this.scene.effects && this.scene.effects.sparks) this.scene.effects.sparks(x, y, Math.min(n, 8), color);
  }

  _nearFlash(e) {
    if (!e || e.x == null || !this.scene.add) return;
    // M7-E: 同じ対象で確定閾値の事前通知が連続して光り続けないよう、品質別のクールダウンで間引く（状態ロジックは不変）。
    const now = this.scene.time ? this.scene.time.now : 0;
    const cd = this._cap('chillNearThresholdEffectCooldown', 1500);
    if (now && e._nearFlashUntil && now < e._nearFlashUntil) { this._bump('nearThreshold'); return; }
    if (now) e._nearFlashUntil = now + cd;
    const ring = this.scene.add.circle(e.x, e.y, 10, 0xe1f5fe, 0).setStrokeStyle(2, 0xe1f5fe, 0.7).setDepth(57);
    this.scene.tweens.add({ targets: ring, radius: 16, alpha: 0, duration: 260, onComplete: () => ring.destroy() });
  }

  _bump(kind) { this._reached[kind] = (this._reached[kind] || 0) + 1; }
  capReached() { return { ...this._reached }; }

  clear() { for (const e of [...this._overlays.keys()]) this._destroyOverlay(e); }
  destroy() { if (this._unsub) this._unsub(); this.clear(); if (this._layer) { this._layer.destroy(true); this._layer = null; } }
}
