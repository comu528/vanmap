// プレイヤー（火属性の魔女）。移動・ダッシュ・HP・被弾無敵・レベル/経験値を持つ。
// 自動攻撃（火球）の発射判定は BattleScene 側の SkillManager が扱う。

import { TEX } from '../config/game-config.js';
import { clamp } from '../utils/math.js';

export class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, cfg) {
    super(scene, x, y, TEX.PLAYER);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setCollideWorldBounds(true);
    this.body.setSize(this.width * 0.5, this.height * 0.6, true);

    this.cfg = cfg;
    this.maxHp = cfg.maxHp;
    this.hp = cfg.maxHp;
    this.moveSpeed = cfg.moveSpeed;

    // ダッシュ
    this.dashMax = cfg.dashCount;
    this.dashCharges = cfg.dashCount;
    this.dashSpeed = cfg.dashSpeed;
    this.dashDurationMs = cfg.dashDurationMs;
    this.dashInvulnMs = cfg.dashInvulnMs;
    this.dashRechargeMs = cfg.dashRechargeMs;
    this._dashTimer = 0;
    this._dashCooldownAccum = 0;
    this._dashDir = new Phaser.Math.Vector2();

    // 無敵
    this.invulnMs = cfg.invulnMs;
    this._invulnUntil = 0;

    // 進行
    this.level = 1;
    this.xp = 0;
    this.xpToNext = cfg.baseXpToLevel || 5;

    this.alive = true;
  }

  get isDashing() { return this._dashTimer > 0; }
  get isInvulnerable() { return this.scene.time.now < this._invulnUntil || this.isDashing; }

  tryDash(dirX, dirY) {
    if (this.isDashing || this.dashCharges <= 0) return false;
    if (dirX === 0 && dirY === 0) return false;
    this._dashDir.set(dirX, dirY).normalize();
    this._dashTimer = this.dashDurationMs;
    this.dashCharges--;
    this._invulnUntil = Math.max(this._invulnUntil, this.scene.time.now + this.dashInvulnMs);
    // ダッシュ拡張フック（M6-D 爆炎歩法）。専用分岐を入力処理へ散在させず共通イベントで通知する。
    if (this.scene.onPlayerDash) this.scene.onPlayerDash('start', this);
    return true;
  }

  // HP消費コスト（M6-D 血炎契約）: 通常の被ダメージ処理とは完全に分離する。
  // 障壁/無敵/不死鳥で防がれず、敵ダメージ統計に含めず、最低HP1を保証（死亡・不死鳥発動をしない）。
  // 実際に消費した量を返す。
  spendHealthCost(amount) {
    if (!this.alive) return 0;
    const cost = Math.max(0, amount || 0);
    const before = this.hp;
    this.hp = Math.max(1, before - cost);
    return before - this.hp;
  }

  // 移動処理。入力ベクトルは -1..1。
  handleMovement(dt, inputX, inputY) {
    if (!this.alive) { this.setVelocity(0, 0); return; }

    if (this.isDashing) {
      this._dashTimer -= dt;
      this.setVelocity(this._dashDir.x * this.dashSpeed, this._dashDir.y * this.dashSpeed);
      if (this.scene.onPlayerDash) this.scene.onPlayerDash('move', this); // 軌跡（M6-D 爆炎歩法）
      if (this._dashTimer <= 0 && this.scene.onPlayerDash) this.scene.onPlayerDash('end', this);
    } else {
      const len = Math.hypot(inputX, inputY) || 1;
      this.setVelocity((inputX / len) * this.moveSpeed, (inputY / len) * this.moveSpeed);
      if (inputX < 0) this.setFlipX(true);
      else if (inputX > 0) this.setFlipX(false);
    }

    // ダッシュ回復
    if (this.dashCharges < this.dashMax) {
      this._dashCooldownAccum += dt;
      if (this._dashCooldownAccum >= this.dashRechargeMs) {
        this._dashCooldownAccum = 0;
        this.dashCharges++;
      }
    }

    // 被弾無敵中の点滅
    this.setAlpha(this.isInvulnerable && !this.isDashing ? 0.5 : 1);
  }

  // 被弾処理（M6-B のダメージ軽減パイプライン）。処理順:
  //   1) 無敵確認 → 2) 炎の障壁による軽減/無効化(＋反撃1回) → 3) 通常HPダメージ → 4) 致死時に不死鳥判定。
  // 障壁/不死鳥の状態(_barrier/_phoenix)は各スキルが設定し、AoE 演出は scene のフックが担う。
  // M8-D: from（被弾方向の発生源座標）は任意。渡されたときだけ戦士の前面防御が判定できる。
  // 渡されない被弾（DoT・方向のない全体攻撃）は前面扱いにならない＝火/氷の計算は完全に不変。
  takeDamage(amount, from) {
    if (!this.alive || this.isInvulnerable) return false; // 1) 無敵中は多重被弾しない
    let dmg = amount;

    // 2) 炎の障壁: 有効かつ耐久が残っていれば軽減/無効化し、1被弾につき1回だけ反撃。
    const b = this._barrier;
    if (b && b.active && b.hitsLeft > 0) {
      if (this.scene.onBarrierBlock) this.scene.onBarrierBlock(b);
      b.hitsLeft -= 1;
      const blocked = dmg * (b.reduction || 0);
      b.blockedTotal = (b.blockedTotal || 0) + blocked;
      b.blocks = (b.blocks || 0) + 1;
      dmg -= blocked;
      if (b.hitsLeft <= 0) b.active = false;
    }

    // 2.5) M8-B 戦士: 強靱（接敵/近接発動直後/突進/闘気解放/不屈/盾撃）による軽減と、
    //      軽減量・被弾量に応じた闘気獲得。戦士以外は onWarriorDamage を持たない/無効で素通りする。
    if (dmg > 0 && this.scene.onWarriorDamage) dmg = this.scene.onWarriorDamage(dmg, from);

    // 3) 通常HPダメージ
    if (dmg > 0) this.hp = clamp(this.hp - dmg, 0, this.maxHp);
    // M9-A.1: 実被弾量（障壁・軽減の後・HP 減算と同じ値）の累計。
    // `_damageTakenTotal` は finalizeTelemetry と F8 が参照していたが**加算する場所が無い dead field**だった。
    // 観測のみ。damage / 状態 / RNG / 判定順序には一切影響しない。
    if (dmg > 0) this.scene._damageTakenTotal = (this.scene._damageTakenTotal || 0) + dmg;
    this._invulnUntil = this.scene.time.now + this.invulnMs;

    // 4) 致死時のみ不死鳥判定（使用可能状態のときだけ・同じ被弾で複数回復活しない）
    if (this.hp <= 0) {
      const ph = this._phoenix;
      if (ph && ph.ready) {
        ph.ready = false;
        ph.cdLeft = ph.cooldownMs;
        ph.triggers = (ph.triggers || 0) + 1;
        this.hp = clamp(this.maxHp * (ph.healPercent || 0.3), 1, this.maxHp);
        ph.healedTotal = (ph.healedTotal || 0) + this.hp;
        this._invulnUntil = this.scene.time.now + (ph.invulnMs || 1000);
        if (this.scene.onPhoenixRevive) this.scene.onPhoenixRevive(ph);
        return true; // 死亡を防いだ
      }
      this.alive = false;
      this.setVelocity(0, 0);
    }
    return true;
  }

  heal(amount) {
    this.hp = clamp(this.hp + amount, 0, this.maxHp);
  }

  // 経験値を加算し、レベルアップしたら回数を返す。
  gainXp(amount, xpGrowth = 1.35) {
    this.xp += amount;
    let levelUps = 0;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level++;
      levelUps++;
      this.xpToNext = Math.round(this.xpToNext * xpGrowth);
    }
    return levelUps;
  }
}
