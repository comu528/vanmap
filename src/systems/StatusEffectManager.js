// StatusEffectManager（Milestone 7-A）: 状態異常のランタイム適用・索引・更新・解除を一手に担う。
// スキルごとに独自の炎上/冷気/凍結タイマーを持たず、Enemy/Boss/エリートが共通経路を使う。
// 状態は各エンティティのフィールド（_chill/_frozenUntil/_freezeImmuneUntil、炎上は _igniteUntil 互換）に保持し、
// 本マネージャは「判定（確率/閾値/上限）」と「索引（entitiesWithStatus/countStatus）」を集約する。
//
// 決定論: 凍結判定は状態異常専用 SeededRandom（rng）を使い、cursor を active_run へ保存する（Math.random 不使用）。
// 時刻は now() で注入（ブラウザ: () => scene.time.now / Node テスト: 可変クロック）。Phaser 直接依存を避け、
// エンティティは軽量なインターフェース（alive/isBoss/isElite/maxHp/_seq ＋ 任意の onFreezeStart/onFreezeEnd）で扱う。
//
// 索引上限（maxStatusIndexEntries）到達時は、新規の状態付与をスキップする（既存状態は壊さない・解除は維持）。
// 炎上（burning）は M6-E 挙動を維持するため上限を課さず、既存の registerBurning 経路と同じ Set を共有する。

import { SeededRandom } from './SeededRandom.js';

function num(v, d = 0) { return (typeof v === 'number' && Number.isFinite(v)) ? v : d; }

export class StatusEffectManager {
  // opts: { registry, freezeSystem, now, seed?, rngState?, cap?, quality? }
  //   cap: (name, fallback) => number（品質別 skillCaps 解決。省略時は無制限）。
  constructor({ registry, freezeSystem, now, seed = 1, rngState = null, cap = null } = {}) {
    this.reg = registry;
    this.fs = freezeSystem;
    this._now = typeof now === 'function' ? now : (() => 0);
    this.rng = rngState ? SeededRandom.restore(rngState) : new SeededRandom((seed >>> 0) || 1, 0);
    this._cap = typeof cap === 'function' ? cap : ((_n, f) => (f == null ? Infinity : f));
    this._index = new Map();       // statusId -> Set<entity>
    this._hitGroupChecks = new Map(); // `${hitGroupId}#${seq}` -> 凍結判定回数
    this._capReached = {};         // 上限到達カウンタ（テレメトリ用）
    // パッシブ由来の乗率（余寒残留）。周回開始時に BattleScene から設定（chill 減衰・氷状態持続）。
    this._chillDecayMult = 1;
    this._iceStatusDurationMult = 1;
    // M7-B.1: 状態表示/デバッグ用のイベント通知（判定・ダメージ・RNG cursor には影響しない）と実動作カウンタ。
    this._listeners = [];
    this._counters = this._freshCounters();
  }

  now() { return this._now(); }

  // ---- イベント（M7-B.1: 状態ロジックと表示ロジックの分離）----
  // 表示側（StatusVisualManager / BossFrostbreakDisplay / デバッグ）が購読する。判定・ダメージ・RNG は変えない。
  on(fn) { if (typeof fn === 'function') this._listeners.push(fn); return () => { const i = this._listeners.indexOf(fn); if (i >= 0) this._listeners.splice(i, 1); }; }
  _emit(type, entity, data) { const ls = this._listeners; for (let i = 0; i < ls.length; i++) { try { ls[i](type, entity, data); } catch (e) { /* 表示側の失敗でゲーム進行を止めない */ } } }

  // ---- 実動作カウンタ（M7-B.1: debug=1 の可視化。CombatTelemetry と重複する shatters/frostbreak は telemetry 側を正とする）----
  _freshCounters() { return { chillApplications: 0, chillAmountTotal: 0, freezeAttempts: 0, freezeSuccesses: 0, immunitySkips: 0, hitGroupSkips: 0, bossGaugeApplications: 0 }; }
  counters() { return { ...this._counters }; }
  resetCounters() { this._counters = this._freshCounters(); }
  setPassiveMods({ chillDecayMult = 1, iceStatusDurationMult = 1 } = {}) {
    this._chillDecayMult = num(chillDecayMult, 1);
    this._iceStatusDurationMult = num(iceStatusDurationMult, 1);
  }

  entityType(e) { return e && e.isBoss ? 'boss' : (e && e.isElite ? 'elite' : 'normal'); }

  // ---- 索引 ----
  indexOf(id) { let s = this._index.get(id); if (!s) { s = new Set(); this._index.set(id, s); } return s; }
  countStatus(id) {
    const s = this._index.get(id); if (!s) return 0;
    let n = 0; for (const e of s) { if (e && e.alive) n++; else s.delete(e); } return n;
  }
  entitiesWithStatus(id, limit = Infinity) {
    const s = this._index.get(id); if (!s) return [];
    const out = [];
    for (const e of s) { if (e && e.alive) { if (out.length < limit) out.push(e); } else s.delete(e); }
    return out;
  }

  // 索引へ登録（上限つき）。burning は上限を課さない（M6-E 挙動維持）。登録可否を返す。
  register(id, e, capName) {
    if (!e) return false;
    const s = this.indexOf(id);
    if (s.has(e)) return true;
    if (id !== 'burning') {
      const cap = this._cap(capName || 'maxStatusIndexEntries', 400);
      if (s.size >= cap) { this._capReached[id] = (this._capReached[id] || 0) + 1; return false; }
    }
    s.add(e);
    return true;
  }
  unregister(id, e) { const s = this._index.get(id); if (s) s.delete(e); }

  capReached() { return { ...this._capReached }; }
  // 状態索引の総サイズ（生存エンティティのみ・デバッグ表示用）。
  statusIndexSize() { let n = 0; for (const s of this._index.values()) { for (const e of s) { if (e && e.alive) n++; else s.delete(e); } } return n; }

  // ---- 炎上（burning）: 索引のみ汎用化・数値/挙動は Enemy.ignite 互換経路が正 ----
  registerBurning(e) { if (e && e.alive) { const s = this.indexOf('burning'); if (!s.has(e)) { s.add(e); this._emit('burningStarted', e, {}); } } }
  unregisterBurning(e) { this.unregister('burning', e); }

  // ---- 冷気 / 凍結 / 耐性 ----
  isFrozen(e) { return !!(e && e.alive && this.now() < (e._frozenUntil || 0)); }
  isChilled(e) { return !!(e && (e._chill || 0) > 0); }
  isFreezeImmune(e) { return !!(e && this.now() < (e._freezeImmuneUntil || 0)); }
  chillOf(e) { return (e && e._chill) || 0; }
  chillRatio(e) { const t = this.entityType(e); const cap = this.fs.chillCap(t); return cap > 0 ? Math.min(1, this.chillOf(e) / cap) : 0; }

  // 冷気を加算し、減速率を更新する。凍結中は冷気を蓄積しない（無制限延長の防止）。
  // 凍結耐性中も設定倍率（immunityChillGainMultiplier）ぶんだけ蓄積できる。
  addChill(e, amount) {
    if (!e || !e.alive) return 0;
    const t = this.entityType(e);
    if (t === 'boss') return 0; // ボスは frozen/chill を持たない（ゲージへ変換）
    if (this.isFrozen(e)) return 0;
    let gain = num(amount, 0) * this.fs.chillGainMultiplier(t);
    if (this.isFreezeImmune(e)) gain *= this.fs.immunityChillGainMultiplier(t);
    if (gain <= 0) return 0;
    const cap = this.fs.chillCap(t);
    const prev = e._chill || 0;
    e._chill = Math.min(cap, prev + gain);
    if (e._chill > 0) {
      if (!this.register('chill', e, 'maxStatusIndexEntries')) { e._chill = prev; return 0; }
      e._chillSlow = this.fs.slowFactor(t, e._chill); // Enemy.effectiveSpeed が読む減速率
      const grace = num(this.fs.freezeConfig().chillDecayGraceMs, 0);
      e._chillDecayGraceUntil = this.now() + grace;
    }
    const applied = e._chill - prev;
    // M7-B.1: 実動作カウンタ＋表示イベント（数値/判定は不変）。
    if (applied > 0) {
      this._counters.chillApplications++;
      this._counters.chillAmountTotal += applied;
      const ratio = cap > 0 ? Math.min(1, e._chill / cap) : 0;
      this._emit('chillChanged', e, { chill: e._chill, ratio, applied });
      // guaranteedFreezeThreshold の 90% 到達の事前通知（表示側で「一度だけ光る」を管理）。
      const near = this.fs.guaranteedThreshold(t) * 0.9;
      if (prev < near && e._chill >= near) this._emit('chillThresholdNear', e, { chill: e._chill, ratio });
    }
    return applied;
  }

  // 凍結を付与する（通常敵・エリートのみ）。凍結中の再付与は延長しない（noExtend）。
  freeze(e) {
    if (!e || !e.alive) return false;
    const t = this.entityType(e);
    if (t === 'boss') return false;
    if (this.isFrozen(e)) return false; // noExtend: 残り時間を延長しない
    if (!this.register('frozen', e, 'maxFrozenEnemies')) return false;
    const dur = this.fs.freezeDuration(t) * this._iceStatusDurationMult;
    e._frozenUntil = this.now() + dur;
    if (typeof e.onFreezeStart === 'function') e.onFreezeStart();
    this._emit('frozenStarted', e, { until: e._frozenUntil, durationMs: dur });
    return true;
  }

  // 凍結を解除し、凍結耐性を付与する（自然解除・粉砕どちらからも呼ぶ）。
  unfreeze(e, { immunity = true } = {}) {
    if (!e) return;
    e._frozenUntil = 0;
    this.unregister('frozen', e);
    if (typeof e.onFreezeEnd === 'function') e.onFreezeEnd();
    const t = this.entityType(e);
    this._emit('frozenEnded', e, { immunity: !!immunity });
    if (immunity && e.alive) {
      e._freezeImmuneUntil = this.now() + this.fs.postFreezeImmunity(t);
      this.register('freeze_immunity', e, 'maxStatusIndexEntries');
      const keepChill = num(this.fs.profile(t).freezeOnUnfreezeChill, 0);
      e._chill = keepChill;
      e._chillSlow = this.fs.slowFactor(t, e._chill);
      this._emit('freezeImmunityStarted', e, { until: e._freezeImmuneUntil });
    }
  }

  // 氷属性命中1回ぶんの処理（冷気付与→凍結判定 or ボスゲージ変換）。
  // ctx: { chillAmount, baseFreezeChance, procCoefficient, hitGroupId, canFreeze, statusPowerMult }
  // 戻り値: { type, froze, chill, gauge, brokeFrost, boss }
  applyIceHit(e, ctx = {}) {
    if (!e || !e.alive) return { froze: false };
    const t = this.entityType(e);
    const powerMult = num(ctx.statusPowerMult, 1);
    const chillAmt = num(ctx.chillAmount, 0) * powerMult;
    if (t === 'boss') {
      // M7-C: ボス氷砕ゲージのみに掛かるスキル固有倍率（frozen_clock/zero_hour_world/everlasting_white_mist）。
      // 通常敵の冷気・凍結・粉砕、damage、procCoefficient には掛からない（この分岐はボス専用・冷気→ゲージ量のみ 1回だけ倍率調整）。
      const gaugeMult = num(ctx.bossGaugeMult, 1);
      const ev = this.addBossGauge(e, chillAmt * gaugeMult);
      return { type: 'boss', boss: true, froze: false, gauge: e._frostGauge || 0, brokeFrost: !!ev, frostbreak: ev };
    }
    // 冷気付与（凍結中/耐性中は addChill 内で抑制/軽減）。
    this.addChill(e, chillAmt);
    // 凍結判定。
    // ※ M7-B.1: デバッグ可視化のため roll を StatusEffectManager 内へインライン化した。
    //   評価順・rng.next() の消費回数は従来 fs.rollFreeze と完全に同一（guaranteed→消費なし / chance<=0→消費なし / それ以外→1回）。
    //   よって status RNG cursor・凍結判定結果は不変（determinism 非回帰はテストで担保）。
    let froze = false;
    const canFreeze = ctx.canFreeze !== false;
    if (canFreeze && !this.isFrozen(e)) {
      if (this.isFreezeImmune(e)) {
        this._counters.immunitySkips++;
        e._statusDebug = { entityType: t, skipped: 'immunity', hitGroupId: ctx.hitGroupId };
      } else if (!this._hitGroupAllows(ctx.hitGroupId, e)) {
        this._counters.hitGroupSkips++;
        e._statusDebug = { entityType: t, skipped: 'hitGroup', hitGroupId: ctx.hitGroupId, checksForGroup: this._hitGroupCountFor(ctx.hitGroupId, e) };
      } else {
        this._counters.freezeAttempts++;
        const params = { baseFreezeChance: num(ctx.baseFreezeChance, 0), procCoefficient: num(ctx.procCoefficient, 1), chill: this.chillOf(e) };
        const r = this.fs.computeFreezeChance(t, params);
        let ok, roll = null;
        if (r.guaranteed) ok = true;
        else if (r.chance <= 0) ok = false;
        else { roll = this.rng.next(); ok = roll < r.chance; }
        if (ok) { froze = this.freeze(e); if (froze) this._counters.freezeSuccesses++; }
        // 凍結判定の内訳（選択中の敵のデバッグ表示用・保存しない）。
        const cap = this.fs.chillCap(t);
        e._statusDebug = {
          entityType: t, baseFreezeChance: params.baseFreezeChance, procCoefficient: params.procCoefficient,
          chill: params.chill, chillRatio: cap > 0 ? Math.min(1, params.chill / cap) : 0,
          chanceFromChill: num(this.fs.freezeConfig().chanceFromChill, 0),
          chance: r.chance, guaranteed: !!r.guaranteed, roll, result: !!ok,
          hitGroupId: ctx.hitGroupId, checksForGroup: this._hitGroupCountFor(ctx.hitGroupId, e), skipped: null,
        };
      }
    }
    return { type: t, froze, chill: this.chillOf(e), boss: false };
  }

  // デバッグ用: 指定 hitGroup×対象の凍結判定回数（副作用なし）。
  _hitGroupCountFor(hitGroupId, e) {
    if (hitGroupId == null) return 0;
    return this._hitGroupChecks.get(`${hitGroupId}#${e && e._seq != null ? e._seq : 'x'}`) || 0;
  }

  // 同じ hitGroupId × 同一対象の凍結判定回数に上限を設ける（多段攻撃での永久凍結防止）。
  _hitGroupAllows(hitGroupId, e) {
    if (hitGroupId == null) return true;
    const cap = Math.max(1, num(this.fs.freezeConfig().sameHitGroupMaxFreezeChecks, 1));
    const key = `${hitGroupId}#${e._seq != null ? e._seq : 'x'}`;
    const n = (this._hitGroupChecks.get(key) || 0);
    if (n >= cap) return false;
    this._hitGroupChecks.set(key, n + 1);
    if (this._hitGroupChecks.size > 512) this._hitGroupChecks.clear(); // メモリ安全（安価・稀）
    return true;
  }

  // ---- ボス氷砕ゲージ ----
  bossThreshold(e) { return this.fs.bossThreshold((e && e._frostBreaks) || 0); }
  bossVulnActive(e) { return !!(e && this.now() < (e._frostbreakVulnUntil || 0)); }
  bossIceVulnMultiplier(e) {
    if (!this.bossVulnActive(e)) return 1;
    return num(this.fs.bossConfig().iceDamageTakenMultiplierDuringVulnerability, 1);
  }

  addBossGauge(e, amount) {
    if (!e || !e.alive) return null;
    const conv = num(this.fs.bossConfig().gaugeConversionMultiplier, 1);
    const add = Math.max(0, num(amount, 0) * conv);
    e._frostGauge = num(e._frostGauge, 0) + add;
    if (add > 0) { this._counters.bossGaugeApplications++; this._emit('bossFrostGaugeChanged', e, { gauge: e._frostGauge, threshold: this.bossThreshold(e), added: add }); }
    const now = this.now();
    if (now < (e._frostbreakCdUntil || 0)) return null; // クールダウン中は break しない
    if (e._frostGauge >= this.bossThreshold(e)) return this.frostbreak(e);
    return null;
  }

  // ボスの氷砕を1回発生させる（同一フレーム複数回は BattleScene 側の per-frame 予算で抑制）。
  frostbreak(e) {
    if (!e || !e.alive) return null;
    const c = this.fs.bossConfig();
    e._frostBreaks = num(e._frostBreaks, 0) + 1;
    e._frostGauge = 0;
    const now = this.now();
    e._frostbreakVulnUntil = now + num(c.vulnerabilityDuration, 4000) * this._iceStatusDurationMult;
    e._frostbreakCdUntil = now + num(c.cooldownAfterBreak, 1500);
    this.register('frostbreak_vulnerability', e, 'maxStatusIndexEntries');
    const ev = {
      breaks: e._frostBreaks,
      staggerMs: num(c.breakStaggerDuration, 350),
      vulnMs: num(c.vulnerabilityDuration, 4000),
      nextThreshold: this.bossThreshold(e),
    };
    this._emit('frostbreakTriggered', e, ev);
    this._emit('frostbreakVulnerabilityStarted', e, { until: e._frostbreakVulnUntil, vulnMs: ev.vulnMs });
    return ev;
  }

  // ---- 粉砕（凍結中の敵のみ・ボスは対象外・再帰なし） ----
  // 戻り値: { damage, radius } または null。BattleScene が AoE/統計/演出を担う。
  shatter(e, { skillPower = 0, powerMult = 1, multiplier = 1 } = {}) {
    if (!e || !e.alive) return null;
    if (this.entityType(e) === 'boss') return null;   // ボスは frostbreak で代替
    if (!this.isFrozen(e)) return null;
    this.unfreeze(e, { immunity: true });
    const s = this.fs.shatterConfig();
    const dmg = this.fs.shatterDamage({ skillPower, maxHp: e.maxHp || 0, powerMult: num(powerMult, 1) * num(multiplier, 1) });
    const res = { damage: dmg, radius: num(s.explosionRadius, 44), explosionDamageFactor: num(s.explosionDamageFactor, 0.5) };
    this._emit('shatterTriggered', e, { damage: dmg, radius: res.radius, x: e.x, y: e.y });
    return res;
  }

  // ---- 毎フレーム更新（冷気減衰・凍結/耐性の期限切れ・索引の掃除） ----
  update(dtMs) {
    const now = this.now();
    // 冷気減衰。
    const chillSet = this._index.get('chill');
    if (chillSet) {
      for (const e of chillSet) {
        if (!e || !e.alive) { chillSet.delete(e); continue; }
        if (this.isFrozen(e)) continue; // 凍結中は減衰しない
        if (now < (e._chillDecayGraceUntil || 0)) continue;
        const t = this.entityType(e);
        const rate = this.fs.decayRate(t) * this._chillDecayMult;
        e._chill = Math.max(0, (e._chill || 0) - rate * (dtMs / 1000));
        if (e._chill <= 0) { e._chill = 0; e._chillSlow = 0; chillSet.delete(e); this._emit('chillChanged', e, { chill: 0, ratio: 0, applied: 0 }); }
        else e._chillSlow = this.fs.slowFactor(t, e._chill);
      }
    }
    // 凍結の自然解除（unfreeze が frozenEnded / freezeImmunityStarted を emit）。
    const frozenSet = this._index.get('frozen');
    if (frozenSet) {
      for (const e of frozenSet) {
        if (!e || !e.alive) { frozenSet.delete(e); continue; }
        if (now >= (e._frozenUntil || 0)) this.unfreeze(e, { immunity: true });
      }
    }
    // 凍結耐性の期限切れ。
    const immSet = this._index.get('freeze_immunity');
    if (immSet) for (const e of immSet) { if (!e || !e.alive || now >= (e._freezeImmuneUntil || 0)) { immSet.delete(e); if (e) this._emit('freezeImmunityEnded', e, {}); } }
    // ボス氷砕脆弱の期限切れ。
    const vulnSet = this._index.get('frostbreak_vulnerability');
    if (vulnSet) for (const e of vulnSet) { if (!e || !e.alive || now >= (e._frostbreakVulnUntil || 0)) { vulnSet.delete(e); if (e) this._emit('frostbreakVulnerabilityEnded', e, {}); } }
    // 炎上（burning）は M6-E 既存経路（Enemy.ignite / burningCount / burningEnemies）が索引管理の正。
    // ここでは索引を変更せず、表示側（StatusVisualManager）が e.ignited を毎フレーム参照して炎上アイコンの
    // 表示/解除を行う（burningStarted/Ended は表示側のトランジション検出で扱い、炎上ロジックへ一切影響しない）。
  }

  // ---- 解除・クリア ----
  clearEntity(e) {
    if (!e) return;
    for (const s of this._index.values()) s.delete(e);
    e._chill = 0; e._chillSlow = 0; e._frozenUntil = 0; e._freezeImmuneUntil = 0;
    e._chillDecayGraceUntil = 0;
  }
  onDeath(e) { if (typeof e?.onFreezeEnd === 'function' && this.isFrozen(e)) e.onFreezeEnd(); this.clearEntity(e); }
  onRelease(e) { this.clearEntity(e); }
  clearAll() {
    for (const s of this._index.values()) s.clear();
    this._hitGroupChecks.clear();
    this._capReached = {};
  }

  // ---- 直列化（状態異常専用 RNG の cursor を active_run へ保存）----
  serialize() { return { rng: this.rng.serialize() }; }
  restore(s) { if (s && s.rng) this.rng = SeededRandom.restore(s.rng); }
}
