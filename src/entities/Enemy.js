// 敵。オブジェクトプールで再利用する。M1 ではプレイヤーへ直進する chase を基本とする。
// dasher / elite などの詳細な挙動は Milestone 2 で拡張する（TODO 参照）。

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
    this._flashUntil = 0;
    this._knockback = new Phaser.Math.Vector2();
    this._knockbackTimer = 0;
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
    this.alive = true;
    this._flashUntil = 0;
    this._knockbackTimer = 0;
    this.setActive(true).setVisible(true).setAlpha(1).setTint(0xffffff);
    this.body.enable = true;
    if (def.elite) this.setScale(1.15); else this.setScale(1);
  }

  update(px, py, dt) {
    if (!this.alive) return;

    if (this._knockbackTimer > 0) {
      this._knockbackTimer -= dt;
      this.setVelocity(this._knockback.x, this._knockback.y);
      this._knockback.scale(0.9);
    } else {
      const ang = Math.atan2(py - this.y, px - this.x);
      this.setVelocity(Math.cos(ang) * this.speed, Math.sin(ang) * this.speed);
    }

    if (this._flashUntil > 0 && this.scene.time.now > this._flashUntil) {
      this._flashUntil = 0;
      this.clearTint();
    }
  }

  applyKnockback(fromX, fromY, force) {
    const f = force * (1 - this.knockbackResist);
    if (f <= 0) return;
    const ang = Math.atan2(this.y - fromY, this.x - fromX);
    this._knockback.set(Math.cos(ang) * f * 4, Math.sin(ang) * f * 4);
    this._knockbackTimer = 120;
  }

  // ダメージを適用。倒れたら true。
  takeDamage(amount) {
    if (!this.alive) return false;
    const dealt = amount * (1 - this.damageReduction);
    this.hp -= dealt;
    this.setTint(0xffffff);
    this.setTintFill(0xffffff);
    this._flashUntil = this.scene.time.now + 60;
    if (this.hp <= 0) {
      this.alive = false;
      return true;
    }
    return false;
  }
}
