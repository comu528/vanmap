// JobModifierManager（Milestone 6-C）: ジョブレベルに応じた補正の解決・適用を一手に担う。
// 各スキルクラスは profile.jobProgress を直接参照せず、jobLevel 判定を個別に持たない。
// 補正はここで「周回開始時のジョブレベル」から解決（resolve）して凍結し、周回中は固定する
// （周回途中に profile 側レベルが変わっても、進行中の周回へは反映しない）。
//
// 効果は「そのジョブを使用中の周回のみ」有効。火の魔女以外・未定義ジョブでは全て恒等（identity）。
// DOM / Phaser 非依存の純粋ロジック（resolve/serialize/echo 判定は Node からテストできる）。
//
// 適用順（docs/architecture.md と一致）:
//   1. JSON 基礎値（skills.json の levels）
//   2. 固定値加算 / 整数補正（発射数など）
//   3. 同カテゴリ内の加算倍率（熟練度・パッシブ）
//   4. カテゴリ間の乗算倍率（ジョブレベル基本成長・到達報酬）  ← 本クラス
//   5. 安全下限・上限（クールダウン下限・skillCaps）
// ダメージ乗算はすべて乗算合成（fire × dot × explosion × evolved）。同じ補正は二重適用しない。

function num(v, d = 0) { return (typeof v === 'number' && Number.isFinite(v)) ? v : d; }

export class JobModifierManager {
  constructor() {
    this._r = JobModifierManager.identity();
    this._echo = { count: 0 };
  }

  // 何も効果が無い恒等の解決結果（Lv1・非対象ジョブ・未解決時）。
  static identity() {
    return {
      jobId: null, jobLevel: 1,
      fireDamageMult: 1, dotDamageMult: 1, fireAreaMult: 1,
      explosionDamageMult: 1, explosionAreaMult: 1, evolvedDamageMult: 1,
      projectileSpeedMult: 1, cooldownMult: 1, projectileCountBonus: 0,
      rareWeightMult: 1, legendaryWeightMult: 1, extraRerolls: 0,
      echo: null,
    };
  }

  // jobConfig（job-progression.json の当該ジョブ）と jobLevel から補正値を解決する。
  // jobConfig が無い / jobLevel<=1 では恒等（＝M6-B 以前と完全一致）。
  static resolve(jobConfig, jobLevel) {
    const r = JobModifierManager.identity();
    if (!jobConfig) return r;
    const cap = num(jobConfig.levelCap, 100);
    const lv = Math.max(1, Math.min(cap, num(jobLevel, 1)));
    r.jobId = jobConfig.jobId || null;
    r.jobLevel = lv;

    const b = jobConfig.perLevelBonuses || {};
    const steps = lv - 1; // Lv1 は 0（恒等）
    r.fireDamageMult = 1 + num(b.fireDamagePerLevel, 0) * steps;
    r.dotDamageMult = 1 + num(b.fireDotPerLevel, 0) * steps;
    r.fireAreaMult = 1 + num(b.fireAreaPerLevel, 0) * steps;

    for (const m of jobConfig.milestones || []) {
      if (lv < num(m.level, Infinity)) continue;
      switch (m.type) {
        case 'fireDamageMult': r.fireDamageMult += num(m.value, 0); break; // Lv5: 基本成長へ加算
        case 'projectileSpeedMult': r.projectileSpeedMult *= (1 + num(m.value, 0)); break; // Lv10
        case 'cooldownMult': r.cooldownMult *= (1 - num(m.value, 0)); break; // Lv20/Lv90（乗算合成）
        case 'rerollBonus': r.extraRerolls += Math.round(num(m.value, 0)); break; // Lv30
        case 'explosion': // Lv40
          r.explosionDamageMult *= (1 + num(m.damage, 0));
          r.explosionAreaMult *= (1 + num(m.area, 0));
          break;
        case 'echo': r.echo = { interval: Math.max(1, Math.round(num(m.interval, 12))), power: num(m.power, 0.6) }; break; // Lv50
        case 'evolvedDamageMult': r.evolvedDamageMult *= (1 + num(m.value, 0)); break; // Lv60
        case 'rarityWeight': r.rareWeightMult *= num(m.rare, 1); r.legendaryWeightMult *= num(m.legendary, 1); break; // Lv70
        case 'projectileCount': r.projectileCountBonus += Math.round(num(m.value, 0)); break; // Lv80
        case 'echoUpgrade': r.echo = { interval: Math.max(1, Math.round(num(m.interval, 8))), power: num(m.power, 1.0) }; break; // Lv100
        default: break;
      }
    }
    return r;
  }

  // 解決済みの補正を適用する（周回開始時・または再開時に active_run から復元した凍結値）。
  setResolved(resolved) { this._r = resolved || JobModifierManager.identity(); this._echo.count = 0; }
  get resolved() { return this._r; }
  get jobLevel() { return this._r.jobLevel; }

  // ---- ダメージ補正 ----
  // tags: { element, isDoT, isExplosion, isEvolved }
  // fire 以外の属性には一切適用しない（架空属性・他ジョブの非火ダメージへ誤適用しない）。
  damageMultiplier(tags = {}) {
    if (tags.element !== 'fire') return 1;
    let m = this._r.fireDamageMult;                 // 火属性の基本成長＋Lv5（全火ダメージ＝弾/DoT/爆発に共通）
    if (tags.isDoT) m *= this._r.dotDamageMult;      // 炎上・火属性DoT へ追加（fire×dot の乗算＝意図した二重適用）
    if (tags.isExplosion) m *= this._r.explosionDamageMult; // Lv40 爆発ダメージ
    if (tags.isEvolved) m *= this._r.evolvedDamageMult;     // Lv60 進化スキル
    return m;
  }

  // ---- 範囲補正（fire のみ）----
  fireAreaMult() { return this._r.fireAreaMult; }
  explosionAreaMult() { return this._r.explosionAreaMult; } // Lv40 爆発範囲（fireArea に追加乗算）

  // ---- クールダウン補正（fire active）----
  // 安全下限は呼び出し側（SkillBase）で既存のクールダウン下限とともにクランプする。
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

  // ---- 残響詠唱（Lv50 / Lv100）----
  echoEnabled() { return !!this._r.echo; }
  echoInterval() { return this._r.echo ? this._r.echo.interval : 0; }
  echoPower() { return this._r.echo ? this._r.echo.power : 0; }
  echoCount() { return this._echo.count; }
  resetEcho() { this._echo.count = 0; }

  // 攻撃用 fire active の「本発動」を1回登録する。閾値到達で true（＝直前の攻撃を1回追加発動する合図）を返す。
  // 追加発動（isEcho）はここを呼ばない＝カウンターを進めない・残響から残響を発生させない。
  // 一時停止中はスキルの update が止まるため、ここも呼ばれない（遅延処理は進まない）。
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
    if (s.resolved) this._r = { ...JobModifierManager.identity(), ...s.resolved };
    this._echo.count = num(s.echoCount, 0);
  }
}
