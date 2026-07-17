// JobModifierManager（Milestone 6-C / 7-A で複数ジョブ・複数属性へ拡張）:
// ジョブレベルに応じた補正の解決・適用を一手に担う。各スキルクラスは profile.jobProgress を直接参照せず、
// jobLevel 判定を個別に持たない。補正はここで「周回開始時のジョブレベル」から解決（resolve）して凍結し、
// 周回中は固定する（周回途中に profile 側レベルが変わっても、進行中の周回へは反映しない）。
//
// 効果は「そのジョブを使用中の周回のみ」有効。未定義ジョブでは全て恒等（identity）。
// ダメージ補正は primaryElement（火の魔女=fire / 氷術師=ice）に一致する属性へのみ適用する
// （火補正を氷へ、氷補正を火へ誤適用しない）。DOM / Phaser 非依存の純粋ロジック（Node からテスト可能）。
//
// 適用順（docs/architecture.md と一致）:
//   1. JSON 基礎値（skills.json の levels）
//   2. 固定値加算 / 整数補正（発射数など）
//   3. 同カテゴリ内の加算倍率（熟練度・パッシブ）
//   4. カテゴリ間の乗算倍率（ジョブレベル基本成長・到達報酬・状態対象ボーナス・進化）  ← 本クラス
//   5. 安全下限・上限（クールダウン下限・skillCaps）
// ダメージ乗算はすべて乗算合成（element × dot × explosion × evolved × 状態対象）。同じ補正は二重適用しない。

function num(v, d = 0) { return (typeof v === 'number' && Number.isFinite(v)) ? v : d; }

export class JobModifierManager {
  constructor() {
    this._r = JobModifierManager.identity();
    this._echo = { count: 0 };
  }

  // 何も効果が無い恒等の解決結果（Lv1・非対象ジョブ・未解決時）。
  static identity() {
    return {
      jobId: null, jobLevel: 1, primaryElement: null,
      // ダメージ系（共通・elementDamageMult は primaryElement のみへ適用）。
      elementDamageMult: 1, dotDamageMult: 1, evolvedDamageMult: 1,
      explosionDamageMult: 1, explosionAreaMult: 1, areaMult: 1,
      // 状態異常の強さ・粉砕・状態対象ボーナス（氷術師）。
      statusPowerMult: 1, shatterDamageMult: 1, chilledDamageMult: 1, frozenDamageMult: 1,
      // 投射・クールダウン・抽選。
      projectileSpeedMult: 1, cooldownMult: 1, projectileCountBonus: 0,
      rareWeightMult: 1, legendaryWeightMult: 1, extraRerolls: 0,
      // 残響（火の魔女）。
      echo: null,
      // 固有到達報酬（Lv50 氷砕連鎖・Lv100 絶対零度 など）。
      shatterOnFrozenKill: null, absoluteZero: null,
    };
  }

  // jobConfig（job-progression.json の当該ジョブ）と jobLevel から補正値を解決する。
  // jobConfig が無い / jobLevel<=1 では恒等（＝拡張前と完全一致）。
  static resolve(jobConfig, jobLevel) {
    const r = JobModifierManager.identity();
    if (!jobConfig) return r;
    const cap = num(jobConfig.levelCap, 100);
    const lv = Math.max(1, Math.min(cap, num(jobLevel, 1)));
    r.jobId = jobConfig.jobId || null;
    r.jobLevel = lv;
    r.primaryElement = jobConfig.element || (jobConfig.jobId === 'flame_witch' ? 'fire' : null);

    const b = jobConfig.perLevelBonuses || {};
    const steps = lv - 1; // Lv1 は 0（恒等）
    // 属性ダメージの基本成長（fire=fireDamagePerLevel / ice=iceDamagePerLevel。ジョブは片方のみ持つ）。
    r.elementDamageMult = 1 + (num(b.fireDamagePerLevel, 0) + num(b.iceDamagePerLevel, 0)) * steps;
    r.dotDamageMult = 1 + num(b.fireDotPerLevel, 0) * steps;            // 火のみ（DoT成長）
    r.areaMult = 1 + num(b.fireAreaPerLevel, 0) * steps;               // 火のみ（範囲成長）
    r.statusPowerMult = 1 + num(b.chillPerLevel, 0) * steps;           // 氷のみ（冷気付与量）
    r.shatterDamageMult = 1 + num(b.shatterPerLevel, 0) * steps;       // 氷のみ（粉砕）

    for (const m of jobConfig.milestones || []) {
      if (lv < num(m.level, Infinity)) continue;
      switch (m.type) {
        // 属性ダメージ加算（火 Lv5=fireDamageMult / 氷 Lv5=elementDamageMult。どちらも基本成長へ加算）。
        case 'fireDamageMult':
        case 'elementDamageMult': r.elementDamageMult += num(m.value, 0); break;
        case 'projectileSpeedMult': r.projectileSpeedMult *= (1 + num(m.value, 0)); break; // 火 Lv10
        case 'cooldownMult': r.cooldownMult *= (1 - num(m.value, 0)); break; // 火/氷 Lv20/Lv90（乗算合成）
        case 'rerollBonus': r.extraRerolls += Math.round(num(m.value, 0)); break; // Lv30
        case 'explosion': // 火 Lv40
          r.explosionDamageMult *= (1 + num(m.damage, 0));
          r.explosionAreaMult *= (1 + num(m.area, 0));
          break;
        case 'echo': r.echo = { interval: Math.max(1, Math.round(num(m.interval, 12))), power: num(m.power, 0.6) }; break; // 火 Lv50
        case 'evolvedDamageMult': r.evolvedDamageMult *= (1 + num(m.value, 0)); break; // Lv60
        case 'rarityWeight': r.rareWeightMult *= num(m.rare, 1); r.legendaryWeightMult *= num(m.legendary, 1); break; // Lv70
        case 'projectileCount': r.projectileCountBonus += Math.round(num(m.value, 0)); break; // Lv80
        case 'echoUpgrade': r.echo = { interval: Math.max(1, Math.round(num(m.interval, 8))), power: num(m.power, 1.0) }; break; // 火 Lv100
        // --- 氷術師の固有到達報酬 ---
        case 'statusPowerMult': r.statusPowerMult += num(m.value, 0); break; // 氷 Lv10 冷気増幅
        case 'statusTargetDamage': // 氷 Lv40 凍結狩り（chilled/frozen 対象ボーナス。同攻撃で二重適用しない＝呼び出し側で frozen 優先）。
          r.chilledDamageMult *= (1 + num(m.chilled, 0));
          r.frozenDamageMult *= (1 + num(m.frozen, 0));
          break;
        case 'shatterOnFrozenKill': // 氷 Lv50 氷砕連鎖
          r.shatterOnFrozenKill = { radiusFactor: num(m.radiusFactor, 1), powerFactor: num(m.powerFactor, 0.6) };
          break;
        case 'absoluteZero': // 氷 Lv100 絶対零度
          r.absoluteZero = {
            normalThresholdReduction: num(m.normalThresholdReduction, 0),
            bossThresholdReduction: num(m.bossThresholdReduction, 0),
            frozenDurationMult: num(m.frozenDurationMult, 0),
          };
          break;
        default: break;
      }
    }
    return r;
  }

  // 旧 active_run（M6-E 以前）の凍結補正を新スキーマへ移行する（fire 非回帰）。
  // 旧: fireDamageMult / fireAreaMult。新: elementDamageMult / areaMult / primaryElement。
  static coerceResolved(src) {
    const r = { ...JobModifierManager.identity(), ...(src || {}) };
    if (src && src.elementDamageMult == null && typeof src.fireDamageMult === 'number') r.elementDamageMult = src.fireDamageMult;
    if (src && src.areaMult == null && typeof src.fireAreaMult === 'number') r.areaMult = src.fireAreaMult;
    // 旧データは火の魔女のみ（火属性）。primaryElement 未設定かつ旧火フィールドがあれば fire とみなす。
    if (r.primaryElement == null && src && (typeof src.fireDamageMult === 'number' || r.jobId === 'flame_witch')) r.primaryElement = 'fire';
    return r;
  }

  // 解決済みの補正を適用する（周回開始時・または再開時に active_run から復元した凍結値）。
  setResolved(resolved) { this._r = JobModifierManager.coerceResolved(resolved); this._echo.count = 0; }
  get resolved() { return this._r; }
  get jobLevel() { return this._r.jobLevel; }
  get primaryElement() { return this._r.primaryElement; }

  // ---- ダメージ補正 ----
  // tags: { element, isDoT, isExplosion, isEvolved, isChilledTarget, isFrozenTarget }
  // primaryElement 以外の属性には一切適用しない（他ジョブ・他属性へ誤適用しない）。
  damageMultiplier(tags = {}) {
    if (!tags.element || tags.element !== this._r.primaryElement) return 1;
    let m = this._r.elementDamageMult;                 // 属性の基本成長＋Lv5（全属性ダメージに共通）
    if (tags.isDoT) m *= this._r.dotDamageMult;         // 炎上・DoT へ追加（火のみ・意図した乗算）
    if (tags.isExplosion) m *= this._r.explosionDamageMult; // Lv40 爆発（火）
    if (tags.isEvolved) m *= this._r.evolvedDamageMult;     // Lv60 進化スキル
    // Lv40 凍結狩り（氷）: frozen/氷砕脆弱 を優先し chilled と二重適用しない。
    if (tags.isFrozenTarget) m *= this._r.frozenDamageMult;
    else if (tags.isChilledTarget) m *= this._r.chilledDamageMult;
    return m;
  }

  // ---- 範囲補正（primaryElement のみ）----
  fireAreaMult() { return this._r.areaMult; }         // 名称は互換（火の範囲成長）。氷は areaMult=1。
  areaMult() { return this._r.areaMult; }
  explosionAreaMult() { return this._r.explosionAreaMult; }

  // ---- 状態異常・粉砕（氷術師）----
  statusPowerMult() { return this._r.statusPowerMult; } // 冷気付与量など
  shatterDamageMult() { return this._r.shatterDamageMult; }
  shatterOnFrozenKill() { return this._r.shatterOnFrozenKill; } // Lv50: null または {radiusFactor, powerFactor}
  absoluteZero() { return this._r.absoluteZero; }               // Lv100: null または {thresholds, frozenDurationMult}

  // ---- クールダウン補正（active）----
  cooldownMult() { return this._r.cooldownMult; }

  // ---- 投射補正 ----
  projectileSpeedMult() { return this._r.projectileSpeedMult; }
  projectileCountBonus() { return this._r.projectileCountBonus; }

  // ---- 抽選補正（Lv70）----
  rarityWeightMult(rarity) {
    if (rarity === 'rare') return this._r.rareWeightMult;
    if (rarity === 'legendary') return this._r.legendaryWeightMult;
    return 1; // common / uncommon は不変
  }
  extraRerolls() { return this._r.extraRerolls; }

  // ---- 残響詠唱（火 Lv50 / Lv100）----
  echoEnabled() { return !!this._r.echo; }
  echoInterval() { return this._r.echo ? this._r.echo.interval : 0; }
  echoPower() { return this._r.echo ? this._r.echo.power : 0; }
  echoCount() { return this._echo.count; }
  resetEcho() { this._echo.count = 0; }

  // 攻撃用 active の「本発動」を1回登録する。閾値到達で true（＝直前の攻撃を1回追加発動する合図）を返す。
  registerCast() {
    if (!this._r.echo) return false;
    this._echo.count += 1;
    if (this._echo.count >= this._r.echo.interval) {
      this._echo.count = 0;
      return true;
    }
    return false;
  }

  // ---- 直列化（active_run へ凍結値と残響カウンターを保存）----
  serialize() { return { resolved: this._r, echoCount: this._echo.count }; }
  restore(s) {
    if (!s) return;
    if (s.resolved) this._r = JobModifierManager.coerceResolved(s.resolved);
    this._echo.count = num(s.echoCount, 0);
  }
}
