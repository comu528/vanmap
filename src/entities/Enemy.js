// 敵。オブジェクトプールで再利用する。プレイヤーへ直進する chase を基本とし、
// 骸骨は接近後に短い予告→突進（dasher）、ゴーレムはエリート（高HP・軽減）。

const TEX_BY_ID = {
  slime: 'enemy_slime',
  bat: 'enemy_bat',
  skeleton: 'enemy_skeleton',
  flame_golem: 'enemy_golem',
};

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  constructor(scene) {
    super(scene, 0, 0, 'enemy_slime');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.def = null;
    this.hp = 1;
    this.maxHp = 1;
    this.speed = 30;
    this.damage = 5;
    this.xpValue = 1;
    this.damageReduction = 0;
    this.alive = false;
    this.lastDamage = 0;
    this._knockback = new Phaser.Math.Vector2();
    this._knockbackTimer = 0;
    this._slowUntil = 0;
    this._slowFactor = 0;
    this._igniteUntil = 0;   // 永劫火界の炎上状態
    this._igniteGen = 0;
    // M7-A: 汎用状態異常（冷気/凍結/凍結耐性）。値は StatusEffectManager が管理する。
    this._chill = 0;               // 冷気蓄積（0..chillCap）
    this._chillSlow = 0;           // 冷気による減速率（0..maxSlow）
    this._chillDecayGraceUntil = 0;
    this._frozenUntil = 0;         // 凍結の終了時刻（ms）
    this._freezeImmuneUntil = 0;   // 凍結耐性の終了時刻（ms）
    this._mark = null;       // 起爆刻印（M6-B）: { hitsNeeded, hits, until, ... }
    this._iceSeal = null;    // 氷封/氷棺の skill-local マーカー（M7-D・正式状態ではない）
    this._iceHitCount = 0;   // 氷属性命中の累積カウンタ（氷封の命中数起爆に使用・M7-D）
    // dasher 用
    this._chargeState = 'idle'; // idle | telegraph | dash
    this._chargeTimer = 0;
    this._chargeDir = new Phaser.Math.Vector2();
  }

  reset(def, x, y, mult) {
    this.def = def;
    const tex = TEX_BY_ID[def.id] || 'enemy_slime';
    this.setTexture(tex);
    this.setPosition(x, y);
    this.maxHp = def.hp * (mult?.hp || 1);
    this.hp = this.maxHp;
    this.speed = def.speed * (mult?.speed || 1);
    this.damage = def.damage * (mult?.damage || 1);
    this.xpValue = def.xp || 1;
    this.damageReduction = def.damageReduction || 0;
    this.knockbackResist = def.knockbackResist ?? 0.2;
    this.behavior = def.behavior || 'chase';
    this.isElite = !!def.elite;
    this.alive = true;
    this.lastDamage = 0;
    this._knockbackTimer = 0;
    this._slowUntil = 0;
    this._slowFactor = 0;
    this._igniteUntil = 0;
    this._igniteGen = 0;
    // M7-A: 状態異常の残留防止（プール再利用時に確実にクリア）。
    this._chill = 0;
    this._chillSlow = 0;
    this._chillDecayGraceUntil = 0;
    this._frozenUntil = 0;
    this._freezeImmuneUntil = 0;
    this._mark = null;
    // M7-D: 氷封/氷棺の skill-local マーカー参照と氷属性命中カウンタ（正式状態ではない・プール再利用で確実にクリア）。
    this._iceSeal = null;
    this._iceHitCount = 0;
    this._chargeState = 'idle';
    this._chargeCd = 1200;
    this._chargeTimer = 0;
    this._chargeDir.set(0, 0);
    this._knockback.set(0, 0);
    this._gridCell = null;              // 空間グリッド登録の残留防止（再利用時に再登録される）
    this.setActive(true).setVisible(true).setAlpha(1).clearTint();
    this.body.enable = true;
    this.setVelocity(0, 0);            // velocity 残留の防止（初回 update までの誤爆防止）
    this.setScale(def.elite ? 1.15 : 1);
  }

  // 凍結中は完全停止（移動・AI・攻撃）。
  get frozen() { return this.alive && this._frozenUntil > 0 && this.scene.time.now < this._frozenUntil; }

  effectiveSpeed() {
    const now = this.scene.time.now;
    let spd = now < this._slowUntil ? this.speed * (1 - this._slowFactor) : this.speed;
    // M7-A: 冷気による減速（既存の減速と乗算合成・攻撃/アニメ速度は変えない）。
    if (this._chillSlow > 0) spd *= (1 - this._chillSlow);
    return Math.max(0, spd);
  }

  // M7-B.1: 凍結/冷気の見た目は StatusVisualManager のオーバーレイ層が担当する（enemy.setTint を状態ごとに
  // 奪い合わない＝被弾フラッシュ/ダッシャー予告/エリート色を上書きしない）。フックは残す（StatusEffectManager が呼ぶ）。
  onFreezeStart() { /* 表示は StatusVisualManager が frozenStarted イベントで処理 */ }
  onFreezeEnd() { if (this.alive && this._chillTinted) { this.clearTint(); this._chillTinted = false; } }

  // 炎上（永劫火界／M6-E 灼熱共鳴・万象炎鳴）。gen は感染世代。
  // 炎上索引（BattleScene._burningIndex）へ登録し、灼熱共鳴系が全敵走査せず炎上数を得られるようにする。
  ignite(ms, gen) {
    this._igniteUntil = this.scene.time.now + ms;
    this._igniteGen = gen || 0;
    if (this.alive && this.scene.registerBurning) this.scene.registerBurning(this);
  }
  get ignited() { return this.alive && this.scene.time.now < this._igniteUntil; }

  update(px, py, dt) {
    if (!this.alive) return;

    // M7-A: 凍結中は移動・AI・攻撃・突進開始をすべて停止（発射済みの敵弾は消さない）。
    if (this.frozen) { this.setVelocity(0, 0); return; }

    if (this._knockbackTimer > 0) {
      this._knockbackTimer -= dt;
      this.setVelocity(this._knockback.x, this._knockback.y);
      this._knockback.scale(0.9);
      return;
    }

    const spd = this.effectiveSpeed();

    if (this.behavior === 'dasher') {
      this._updateDasher(px, py, dt, spd);
      return;
    }

    const ang = Math.atan2(py - this.y, px - this.x);
    this.setVelocity(Math.cos(ang) * spd, Math.sin(ang) * spd);
    // M7-B.1: 冷気の視覚は StatusVisualManager のオーバーレイ層へ移行（enemy.setTint を毎フレーム奪わない）。
  }

  // 骸骨: 一定距離まで近づき、短い予告のあと突進する。
  _updateDasher(px, py, dt, spd) {
    const dx = px - this.x, dy = py - this.y;
    const dist = Math.hypot(dx, dy);

    if (this._chargeState === 'dash') {
      this._chargeTimer -= dt;
      this.setVelocity(this._chargeDir.x * (this.def.chargeSpeed || 200), this._chargeDir.y * (this.def.chargeSpeed || 200));
      if (this._chargeTimer <= 0) { this._chargeState = 'idle'; this._chargeCd = 1400; }
      return;
    }
    if (this._chargeState === 'telegraph') {
      this._chargeTimer -= dt;
      this.setVelocity(0, 0);
      this.setTint(0xffcc80);
      if (this._chargeTimer <= 0) {
        this.clearTint();
        this._chargeDir.set(dx, dy).normalize();
        this._chargeState = 'dash';
        this._chargeTimer = 360;
      }
      return;
    }

    // idle: 近づく
    this._chargeCd -= dt;
    if (dist < 140 && this._chargeCd <= 0) {
      this._chargeState = 'telegraph';
      this._chargeTimer = this.def.chargeTelegraphMs || 600;
      return;
    }
    const ang = Math.atan2(dy, dx);
    this.setVelocity(Math.cos(ang) * spd, Math.sin(ang) * spd);
  }

  applyKnockback(fromX, fromY, force) {
    const f = force * (1 - this.knockbackResist);
    if (f <= 0) return;
    const ang = Math.atan2(this.y - fromY, this.x - fromX);
    this._knockback.set(Math.cos(ang) * f * 4, Math.sin(ang) * f * 4);
    this._knockbackTimer = 120;
  }

  applySlow(factor, ms) {
    // 強い方の減速を優先
    if (factor >= this._slowFactor || this.scene.time.now >= this._slowUntil) {
      this._slowFactor = factor;
    }
    this._slowUntil = this.scene.time.now + ms;
  }

  // ダメージを適用。倒れたら true。フラッシュ演出は EffectManager 側で行う。
  takeDamage(amount) {
    if (!this.alive) return false;
    const dealt = amount * (1 - this.damageReduction);
    this.lastDamage = dealt; // 与ダメージ（統計/最高ダメージ用。オーバーキルも出力として計上）
    this.hp -= dealt;
    if (this.hp <= 0) {
      this.alive = false;
      return true;
    }
    return false;
  }
}
