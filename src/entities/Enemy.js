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

  effectiveSpeed() {
    const now = this.scene.time.now;
    return now < this._slowUntil ? this.speed * (1 - this._slowFactor) : this.speed;
  }

  // 炎上（永劫火界）。gen は感染世代。
  ignite(ms, gen) {
    this._igniteUntil = this.scene.time.now + ms;
    this._igniteGen = gen || 0;
  }
  get ignited() { return this.alive && this.scene.time.now < this._igniteUntil; }

  update(px, py, dt) {
    if (!this.alive) return;

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
