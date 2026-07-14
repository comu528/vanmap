// ボス。通常敵の拡大ではなく専用の見た目（boss_flame_lord テクスチャ）と挙動を持つ。
// 挙動: 突進 / 円形弾 / 雑魚召喚。HP50%以下で攻撃頻度上昇（enrage）。

import { TEX } from '../config/game-config.js';

export class Boss extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, def, hpMult) {
    super(scene, x, y, TEX.BOSS_FLAME_LORD);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(55);
    this.isBoss = true;
    this.def = def;
    this.maxHp = def.hp * (hpMult || 1);
    this.hp = this.maxHp;
    this.damage = def.damage;
    this.speed = def.speed;
    this.alive = true;
    this.lastDamage = 0;

    this.state = 'chase';
    this._chargeDir = new Phaser.Math.Vector2();
    this._stateTimer = 0;

    this.enraged = false;
    this.enrageThreshold = def.enrage?.hpThreshold ?? 0.5;
    this.enrageMult = def.enrage?.cooldownMultiplier ?? 0.6;

    // 攻撃タイマー（ms）
    this.attacks = (def.attacks || []).map((a) => ({ ...a, timer: a.cooldownMs }));
    this._flashUntil = 0;
  }

  cdMult() { return this.enraged ? this.enrageMult : 1; }

  update(dt, player) {
    if (!this.alive) return;

    // enrage 判定
    if (!this.enraged && this.hp <= this.maxHp * this.enrageThreshold) {
      this.enraged = true;
      this.setTint(0xff5252);
      this.scene.effects?.whiteFlash();
      this.scene.showBanner?.('ボスが激昂した！攻撃が激化する');
    }

    if (this._flashUntil > 0 && this.scene.time.now > this._flashUntil && !this.enraged) {
      this._flashUntil = 0; this.clearTint();
    }

    if (this.state === 'telegraph') {
      this._stateTimer -= dt;
      this.setVelocity(0, 0);
      if (this._stateTimer <= 0) {
        this._chargeDir.set(player.x - this.x, player.y - this.y).normalize();
        this.state = 'charge';
        this._stateTimer = 520;
      }
      return;
    }
    if (this.state === 'charge') {
      this._stateTimer -= dt;
      const cs = this._chargeSpeed || 240;
      this.setVelocity(this._chargeDir.x * cs, this._chargeDir.y * cs);
      if (this._stateTimer <= 0) this.state = 'chase';
      return;
    }

    // chase: プレイヤーへゆっくり接近
    const ang = Math.atan2(player.y - this.y, player.x - this.x);
    this.setVelocity(Math.cos(ang) * this.speed, Math.sin(ang) * this.speed);

    // 攻撃トリガ
    for (const atk of this.attacks) {
      atk.timer -= dt;
      if (atk.timer > 0) continue;
      atk.timer = atk.cooldownMs * this.cdMult();
      this._performAttack(atk, player);
    }
  }

  _performAttack(atk, player) {
    if (atk.type === 'charge') {
      this.state = 'telegraph';
      this._stateTimer = atk.telegraphMs || 700;
      this._chargeSpeed = atk.speed || 240;
      this.scene.effects?.telegraph(player.x, player.y, 40, atk.telegraphMs || 700, 0xff5252);
    } else if (atk.type === 'radial_bullets') {
      const n = atk.bulletCount || 12;
      for (let i = 0; i < n; i++) {
        const a = (Math.PI * 2 * i) / n;
        this.scene.spawnBossBullet(this.x, this.y, a, atk.bulletSpeed || 120);
      }
      this.scene.effects?.sparks(this.x, this.y, 8, 0xff5252);
    } else if (atk.type === 'summon') {
      const c = atk.count || 3;
      for (let i = 0; i < c; i++) this.scene.spawnZakoNear(this.x, this.y);
    }
  }

  takeDamage(amount) {
    if (!this.alive) return false;
    this.hp -= amount;
    this.lastDamage = amount;
    this._flashUntil = this.scene.time.now + 55;
    if (!this.enraged) this.setTintFill(0xffffff);
    if (this.hp <= 0) { this.alive = false; return true; }
    return false;
  }

  hpRatio() { return Math.max(0, this.hp / this.maxHp); }
}
